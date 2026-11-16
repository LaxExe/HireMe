import { plainText } from "../utils";
import { EXTENDED_LARP_CATALOG, findCatalogEntry, LARP_CATALOG } from "./catalog";
import { DEFAULT_CALIBRATION, SINGLE_LINE_NCU } from "./config";
import {
  checkLineBudget,
  computeVisualWidth,
  computeWordReframeStats,
  containsPhrase,
  defaultFontMeasurer,
  heuristicMeasurer,
  type Measurer,
} from "./text";
import type {
  BulletMutationProposal,
  CalibrationConfig,
  CatalogEntry,
  GuardrailViolation,
  LarpTierClassification,
  LineBudgetCheck,
  MalleableSynthesizedBullet,
  SkillCategory,
  ViolationCode,
  WordReframeStats,
} from "./types";

export type { Measurer };
export const defaultHeuristicMeasurer: Measurer = {
  width(text: string, bold = false): number {
    return heuristicMeasurer.width(text, bold);
  },
};
export { defaultFontMeasurer };

export interface GuardContext {
  matchers: CatalogEntry[];
  /** Tier-2 tech labels or ids not on the resume */
  blocked: Set<string>;
  /** Pure Tier-1.5 skills-only tech labels or ids not on the resume */
  skillsOnly: Set<string>;
  calibration: CalibrationConfig;
  measurer: Measurer;
  maxWordsCap: number;
  singleLineNcu: number;
}

export function createGuardContext(
  tiers?: LarpTierClassification,
  calibration: CalibrationConfig = DEFAULT_CALIBRATION,
  measurer: Measurer = defaultHeuristicMeasurer,
  maxWordsCap = 7,
  singleLineNcu = SINGLE_LINE_NCU
): GuardContext {
  const blocked = new Set<string>();
  const skillsOnly = new Set<string>();

  if (tiers) {
    for (const b of tiers.tier_2_banned) {
      blocked.add(b.toLowerCase());
      const entry = findCatalogEntry(b);
      if (entry) {
        blocked.add(entry.id.toLowerCase());
        blocked.add(entry.label.toLowerCase());
      }
    }

    const framingOrWorkflow = new Set(
      [...tiers.tier_0_workflow, ...tiers.tier_1_framing].map((k) => k.toLowerCase())
    );
    for (const s of tiers.tier_1_5_skills_only) {
      if (!framingOrWorkflow.has(s.toLowerCase())) {
        skillsOnly.add(s.toLowerCase());
        const entry = findCatalogEntry(s);
        if (entry) {
          skillsOnly.add(entry.id.toLowerCase());
          skillsOnly.add(entry.label.toLowerCase());
        }
      }
    }
  } else {
    for (const entry of LARP_CATALOG) {
      if (entry.tier === "tier_2_banned") {
        blocked.add(entry.id.toLowerCase());
        blocked.add(entry.label.toLowerCase());
      } else if (entry.tier === "tier_1_5_skills_only" && !entry.alsoSkills) {
        skillsOnly.add(entry.id.toLowerCase());
        skillsOnly.add(entry.label.toLowerCase());
      }
    }
  }

  return {
    matchers: EXTENDED_LARP_CATALOG,
    blocked,
    skillsOnly,
    calibration,
    measurer,
    maxWordsCap,
    singleLineNcu,
  };
}

export function extractMetricsAndNumbers(markup: string): string[] {
  const text = plainText(markup);
  const matches = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?(?:%|x|Hz|\+|-hour|s)?\b/gi);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

function entryMatchesText(entry: CatalogEntry, text: string): boolean {
  if (containsPhrase(text, entry.label)) return true;
  const strongAliases = entry.aliases.filter((a) => a.length >= 2);
  return strongAliases.some((a) => containsPhrase(text, a));
}

/**
 * Single source of truth validator used by every candidate source (rules, generic suffixes, LLM, user edits).
 */
export function validateRewrite(
  original: string,
  candidate: string,
  targetId: string,
  ctx: GuardContext = createGuardContext()
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const origPlain = plainText(original);
  const candPlain = plainText(candidate);

  const targetEntry = findCatalogEntry(targetId);
  const targetLabel = targetEntry?.label ?? targetId;
  const targetLower = targetLabel.toLowerCase();
  const targetIdLower = (targetEntry?.id ?? targetId).toLowerCase();

  // 1. missing_keyword: the target keyword is absent from the result
  const hasTarget = targetEntry
    ? entryMatchesText(targetEntry, candPlain)
    : containsPhrase(candPlain, targetId);
  if (!hasTarget) {
    violations.push({
      code: "missing_keyword",
      message: `Target keyword "${targetLabel}" is absent from the candidate rewrite.`,
    });
  }

  // 2. banned_term & new_tech: check all catalog technologies
  for (const entry of ctx.matchers) {
    const inCand = entryMatchesText(entry, candPlain);
    if (!inCand) continue;

    const inOrig = entryMatchesText(entry, origPlain);
    if (inOrig) continue;

    const isTarget =
      entry.id.toLowerCase() === targetIdLower ||
      entry.label.toLowerCase() === targetLower ||
      entry.aliases.some((a) => a.toLowerCase() === targetLower);

    const isBlocked =
      ctx.blocked.has(entry.id.toLowerCase()) ||
      ctx.blocked.has(entry.label.toLowerCase());
    const isSkillsOnly =
      ctx.skillsOnly.has(entry.id.toLowerCase()) ||
      ctx.skillsOnly.has(entry.label.toLowerCase());

    if (isBlocked || isSkillsOnly) {
      violations.push({
        code: "banned_term",
        message: `${isBlocked ? "Tier-2 banned" : "Tier-1.5 skills-only"} technology "${entry.label}" cannot be injected into bullets.`,
      });
      continue;
    }

    if (!isTarget) {
      violations.push({
        code: "new_tech",
        message: `Non-target technology "${entry.label}" was introduced into the bullet.`,
      });
    }
  }

  // Also check explicit blocked / skillsOnly strings that might not be in matchers
  for (const b of ctx.blocked) {
    if (b.length >= 2 && containsPhrase(candPlain, b) && !containsPhrase(origPlain, b)) {
      if (!violations.some((v) => v.code === "banned_term")) {
        violations.push({
          code: "banned_term",
          message: `Blocked term "${b}" appeared in the candidate rewrite.`,
        });
      }
    }
  }
  for (const s of ctx.skillsOnly) {
    if (s.length >= 2 && containsPhrase(candPlain, s) && !containsPhrase(origPlain, s)) {
      if (!violations.some((v) => v.code === "banned_term")) {
        violations.push({
          code: "banned_term",
          message: `Skills-only term "${s}" appeared in the candidate rewrite.`,
        });
      }
    }
  }

  // 3. no_change & too_many_changes: word diff check
  const wordStats = computeWordReframeStats(original, candidate, ctx.maxWordsCap);
  if (wordStats.reframedWords === 0 && origPlain.trim() === candPlain.trim()) {
    violations.push({
      code: "no_change",
      message: "Candidate rewrite made 0 word changes from the original bullet.",
    });
  } else if (wordStats.reframedWords === 0) {
    violations.push({
      code: "no_change",
      message: "Candidate rewrite made 0 effective word changes.",
    });
  } else if (wordStats.reframedWords > ctx.maxWordsCap) {
    violations.push({
      code: "too_many_changes",
      message: `Candidate rewrite changed ${wordStats.reframedWords} words (maximum allowed is ${ctx.maxWordsCap}).`,
    });
  }

  // 4. metric_changed: any number or percentage from the original is missing
  const origMetrics = extractMetricsAndNumbers(original);
  const candMetrics = extractMetricsAndNumbers(candidate);
  for (const m of origMetrics) {
    if (!candMetrics.includes(m)) {
      violations.push({
        code: "metric_changed",
        message: `Original number or metric "${m}" is missing or altered in the candidate rewrite.`,
      });
      break;
    }
  }

  // 5. overflow & line_growth: line budget checks
  const budget = checkLineBudget(original, candidate, ctx.calibration, ctx.singleLineNcu);
  const twoLineMax = ctx.calibration.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;
  if (budget.candFit.status === "overflow" || budget.candChars > twoLineMax) {
    violations.push({
      code: "overflow",
      message: `Candidate rewrite (${budget.candChars} chars) exceeds the 2-line maximum (${twoLineMax} chars).`,
    });
  } else if (budget.candLines > budget.origLines && budget.candFit.tone !== "green") {
    violations.push({
      code: "line_growth",
      message: `Candidate grew from ${budget.origLines}L to ${budget.candLines}L without landing in the ideal green zone (${budget.candFit.status}).`,
    });
  }

  return violations;
}

export function verifyZeroBannedInMarkup(markup: string, bannedLower: string[]): boolean {
  const text = plainText(markup);
  return !bannedLower.some((b) => containsPhrase(text, b));
}

export function verifyRunGuardrailZeroBanned(
  updatedCategories: SkillCategory[],
  bulletProposals: BulletMutationProposal[],
  malleableBullets: MalleableSynthesizedBullet[],
  bannedLower: string[]
): boolean {
  const allMutatedText = [
    ...updatedCategories.flatMap((c) => c.skills.map((s) => s.name)),
    ...bulletProposals.map((p) => plainText(p.mutatedMarkup)),
    ...malleableBullets.map((m) => plainText(m.markup)),
  ].join(" ");

  return !bannedLower.some((b) => containsPhrase(allMutatedText, b));
}

export function evaluateCandidateGuardrails(
  origMarkup: string,
  fittedMarkup: string,
  bannedLower: string[],
  cal: CalibrationConfig,
  singleLineNcu = 98.0,
  maxWordsCap = 7,
  targetKeyword?: string,
  guardCtx?: GuardContext
): {
  valid: boolean;
  budget?: LineBudgetCheck;
  wordStats?: WordReframeStats;
  violations?: GuardrailViolation[];
} {
  const budget = checkLineBudget(origMarkup, fittedMarkup, cal, singleLineNcu);
  const wordStats = computeWordReframeStats(origMarkup, fittedMarkup, maxWordsCap);

  if (targetKeyword) {
    const ctx =
      guardCtx ??
      createGuardContext(
        {
          matched: [],
          tier_0_workflow: [],
          tier_1_framing: [targetKeyword],
          tier_1_5_skills_only: [],
          tier_2_banned: bannedLower,
        },
        cal,
        defaultHeuristicMeasurer,
        maxWordsCap,
        singleLineNcu
      );
    const violations = validateRewrite(origMarkup, fittedMarkup, targetKeyword, ctx);
    return {
      valid: violations.length === 0 && budget.valid && wordStats.withinCap,
      budget,
      wordStats,
      violations,
    };
  }

  if (!verifyZeroBannedInMarkup(fittedMarkup, bannedLower)) {
    return {
      valid: false,
      budget,
      wordStats,
      violations: [{ code: "banned_term", message: "Banned term detected." }],
    };
  }
  if (!budget.valid) {
    return {
      valid: false,
      budget,
      wordStats,
      violations: [
        {
          code: budget.candFit.status === "overflow" ? "overflow" : "line_growth",
          message: "Line budget check failed.",
        },
      ],
    };
  }
  if (!wordStats.withinCap) {
    return {
      valid: false,
      budget,
      wordStats,
      violations: [
        {
          code: wordStats.reframedWords === 0 ? "no_change" : "too_many_changes",
          message: "Word diff cap failed.",
        },
      ],
    };
  }
  return { valid: true, budget, wordStats, violations: [] };
}

export type { ViolationCode, GuardrailViolation };
