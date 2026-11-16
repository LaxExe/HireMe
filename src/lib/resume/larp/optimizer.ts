import { markupToLatex } from "../latex";
import { checkSlotPlausibility, tryMinimalKeywordInjection } from "./candidates";
import { createGuardContext, evaluateCandidateGuardrails, type GuardContext } from "./guardrails";
import type { LlmValidatedCandidate } from "./llm";
import { scoreCandidate } from "./scoring";
import { fitBulletToCalibratedLineArea } from "./text";
import type {
  BulletMutationProposal,
  CalibrationConfig,
  CandidateBulletSlot,
  LarpTierClassification,
  LineBudgetCheck,
  ScoreFeatures,
  ViolationCode,
  WordReframeStats,
} from "./types";

export interface KeywordCandidateStats {
  keyword: string;
  implausibleSlotsCount: number;
  noRuleMatchSlotsCount: number;
  rejectionCountsByCode: Partial<Record<ViolationCode, number>>;
  validCandidateCount: number;
  assignedSlotId?: string;
}

/**
 * Exact Hungarian (Kuhn-Munkres) algorithm for maximum-weight bipartite matching.
 * Given an `m x k` matrix `weights` (`m <= k`, all weights >= 0), returns an array `assignment`
 * of length `m` where `assignment[i]` is the chosen column `j` for row `i` maximizing total weight.
 */
export function solveMaxWeightAssignment(weights: number[][]): number[] {
  const m = weights.length;
  if (m === 0) return [];
  const k = weights[0]?.length ?? 0;
  if (k === 0) return Array(m).fill(-1);

  const maxW = Math.max(0, ...weights.flat());
  const cost: number[][] = weights.map((row) => row.map((w) => maxW - Math.max(0, w)));

  // 1-indexed arrays for Kuhn-Munkres
  const u = new Array<number>(m + 1).fill(0);
  const v = new Array<number>(k + 1).fill(0);
  const p = new Array<number>(k + 1).fill(0);
  const way = new Array<number>(k + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(k + 1).fill(Infinity);
    const used = new Array<boolean>(k + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= k; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= k; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number>(m).fill(-1);
  for (let j = 1; j <= k; j++) {
    if (p[j] > 0 && p[j] <= m) {
      assignment[p[j] - 1] = j - 1;
    }
  }
  return assignment;
}

export interface SelectBulletMutationsOptions {
  variantOffset?: number;
  singleLineNcu?: number;
  tiers?: LarpTierClassification;
  guardCtx?: GuardContext;
  statsOut?: Map<string, KeywordCandidateStats>;
  llmCandidates?: LlmValidatedCandidate[];
  keywordWeights?: Map<string, number>;
  excludePairs?: Set<string>;
}

interface EvaluatedPairCandidate {
  slot: CandidateBulletSlot;
  keyword: string;
  mutatedMarkup: string;
  reason: string;
  score: number;
  scoreFeatures: ScoreFeatures;
  budget: LineBudgetCheck;
  wordStats: WordReframeStats;
  source: "rule" | "generic" | "llm";
}

/**
 * Globally optimal assignment of JD keywords to resume bullet slots using the Hungarian algorithm.
 * Each bullet receives at most one keyword.
 * Supports `excludePairs` (`slotId|keywordLower`) so regenerating returns a genuinely different plan.
 */
export function selectBulletMutations(
  slots: CandidateBulletSlot[],
  centralizedTargetKeywords: string[],
  bannedLower: string[],
  cal: CalibrationConfig,
  variantOffset = 0,
  singleLineNcu = 98.0,
  tiers?: LarpTierClassification,
  guardCtx?: GuardContext,
  statsOut?: Map<string, KeywordCandidateStats>,
  llmCandidates?: LlmValidatedCandidate[],
  keywordWeights?: Map<string, number>,
  excludePairs?: Set<string>
): BulletMutationProposal[] {
  const m = centralizedTargetKeywords.length;
  const n = slots.length;
  if (m === 0 || n === 0) return [];

  const ctx =
    guardCtx ?? (tiers ? createGuardContext(tiers, cal, undefined, 7, singleLineNcu) : undefined);

  // Build candidate map: row i (keyword) -> col j (slot) -> best EvaluatedPairCandidate
  const bestCandidateMatrix: (EvaluatedPairCandidate | null)[][] = Array.from(
    { length: m },
    () => Array(n).fill(null)
  );
  // Total columns = n real bullet slots + m dummy "skip" columns (one per keyword)
  const totalCols = n + m;
  const weightMatrix: number[][] = Array.from({ length: m }, () =>
    Array(totalCols).fill(0)
  );

  const statsByRow: KeywordCandidateStats[] = [];

  for (let i = 0; i < m; i++) {
    const keyword = centralizedTargetKeywords[i];
    const kwLower = keyword.toLowerCase();
    const kwWeight = keywordWeights?.get(kwLower) ?? 1.0;
    // Slight deterministic priority tie-breaker so earlier catalog keywords win exact ties cleanly
    const priorityFactor = 1 + (m - i) * 0.0001;

    const kwStats: KeywordCandidateStats = {
      keyword,
      implausibleSlotsCount: 0,
      noRuleMatchSlotsCount: 0,
      rejectionCountsByCode: {},
      validCandidateCount: 0,
    };

    for (let j = 0; j < n; j++) {
      const slot = slots[j];
      const pairKey = `${slot.bullet.id}|${kwLower}`;
      const pairKeyAlt = `${slot.bullet.id}|${keyword}`;
      if (excludePairs && (excludePairs.has(pairKey) || excludePairs.has(pairKeyAlt))) {
        continue;
      }

      const plausibility = checkSlotPlausibility(slot, keyword);
      if (!plausibility.ok) {
        kwStats.implausibleSlotsCount++;
        continue;
      }

      const pairOptions: EvaluatedPairCandidate[] = [];

      const attempt = tryMinimalKeywordInjection(slot.bullet.text, slot.context, keyword);
      if (!attempt) {
        kwStats.noRuleMatchSlotsCount++;
      } else {
        const fittedMarkup = fitBulletToCalibratedLineArea(attempt.mutatedMarkup, cal);
        const guard = evaluateCandidateGuardrails(
          slot.bullet.text,
          fittedMarkup,
          bannedLower,
          cal,
          singleLineNcu,
          7,
          keyword,
          ctx
        );
        if (!guard.valid || !guard.budget || !guard.wordStats) {
          for (const v of guard.violations ?? []) {
            kwStats.rejectionCountsByCode[v.code] =
              (kwStats.rejectionCountsByCode[v.code] ?? 0) + 1;
          }
        } else {
          const features = scoreCandidate({
            ruleScore: attempt.fitScore,
            jdWeight: kwWeight,
            wordsChanged: guard.wordStats.reframedWords,
            fit: guard.budget.candFit,
            domainOverlap: plausibility.contextOverlap,
            pairsWithHit: plausibility.pairsWithHit,
            containerKind: slot.containerKind,
            isOlderRole: slot.defensibilityBonus > 0 && slot.containerKind === "experience",
          });

          pairOptions.push({
            slot,
            keyword,
            mutatedMarkup: fittedMarkup,
            reason: attempt.reason,
            score: features.total,
            scoreFeatures: features,
            budget: guard.budget,
            wordStats: guard.wordStats,
            source: attempt.source ?? "rule",
          });
        }
      }

      if (llmCandidates && llmCandidates.length > 0) {
        for (const llmCand of llmCandidates) {
          if (
            llmCand.keyword.toLowerCase() === kwLower &&
            llmCand.slot.bullet.id === slot.bullet.id
          ) {
            const llmFeatures = scoreCandidate({
              ruleScore: llmCand.baseScore,
              jdWeight: kwWeight,
              wordsChanged: llmCand.wordStats.reframedWords,
              fit: llmCand.budget.candFit,
              domainOverlap: plausibility.contextOverlap,
              pairsWithHit: plausibility.pairsWithHit,
              containerKind: slot.containerKind,
              isOlderRole: slot.defensibilityBonus > 0 && slot.containerKind === "experience",
              llmRating: llmCand.llmRating,
            });
            pairOptions.push({
              slot: llmCand.slot,
              keyword,
              mutatedMarkup: llmCand.mutatedMarkup,
              reason: llmCand.reason,
              score: llmFeatures.total,
              scoreFeatures: llmFeatures,
              budget: llmCand.budget,
              wordStats: llmCand.wordStats,
              source: "llm",
            });
          }
        }
      }

      if (pairOptions.length > 0) {
        pairOptions.sort((a, b) => b.score - a.score);
        const bestForPair = pairOptions[0];
        bestCandidateMatrix[i][j] = bestForPair;
        weightMatrix[i][j] = Number(
          (kwWeight * bestForPair.score * priorityFactor).toFixed(4)
        );
        kwStats.validCandidateCount++;
      }
    }

    statsByRow.push(kwStats);
  }

  // Legacy support: if `variantOffset > 0` and no `excludePairs` were supplied, rotate each keyword's top choice
  if (variantOffset > 0 && (!excludePairs || excludePairs.size === 0)) {
    const firstPassAssignment = solveMaxWeightAssignment(weightMatrix);
    const derivedExcludes = new Set<string>();
    for (let r = 0; r < variantOffset; r++) {
      const currentAssign = r === 0 ? firstPassAssignment : solveMaxWeightAssignment(weightMatrix);
      let anyExcluded = false;
      for (let i = 0; i < m; i++) {
        const col = currentAssign[i];
        if (col >= 0 && col < n && bestCandidateMatrix[i][col]) {
          // Only zero out if there is at least one alternative slot for this keyword
          const altCols = bestCandidateMatrix[i].filter((c, cIdx) => c !== null && cIdx !== col);
          if (altCols.length > 0) {
            weightMatrix[i][col] = 0;
            bestCandidateMatrix[i][col] = null;
            derivedExcludes.add(`${slots[col].bullet.id}|${centralizedTargetKeywords[i].toLowerCase()}`);
            anyExcluded = true;
          }
        }
      }
      if (!anyExcluded) break;
    }
  }

  const assignment = solveMaxWeightAssignment(weightMatrix);
  const bulletProposals: BulletMutationProposal[] = [];

  for (let i = 0; i < m; i++) {
    const col = assignment[i];
    const kwStats = statsByRow[i];

    if (col >= 0 && col < n) {
      const chosen = bestCandidateMatrix[i][col];
      if (chosen && weightMatrix[i][col] > 0) {
        kwStats.assignedSlotId = chosen.slot.bullet.id;
        const origLatex = `\\item ${markupToLatex(chosen.slot.bullet.text)}`;
        const candLatex = `\\item ${markupToLatex(chosen.mutatedMarkup)}`;

        bulletProposals.push({
          bulletId: chosen.slot.bullet.id,
          containerId: chosen.slot.containerId,
          containerTitle: chosen.slot.containerTitle,
          containerKind: chosen.slot.containerKind,
          contextCategory: chosen.slot.context,
          originalMarkup: chosen.slot.bullet.text,
          mutatedMarkup: chosen.mutatedMarkup,
          originalLatex: origLatex,
          mutatedLatex: candLatex,
          budget: chosen.budget,
          wordStats: chosen.wordStats,
          injectedKeywords: [chosen.keyword],
          reason: chosen.reason,
          accepted: true,
          source: chosen.source,
          scoreFeatures: chosen.scoreFeatures,
          totalScore: chosen.score,
        });
      }
    }

    if (statsOut) {
      statsOut.set(kwStats.keyword.toLowerCase(), kwStats);
    }
  }

  return bulletProposals;
}
