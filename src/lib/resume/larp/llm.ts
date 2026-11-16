import { markupToLatex } from "../latex";
import { bulletFit, plainText } from "../utils";
import { checkSlotPlausibility } from "./candidates";
import { findCatalogEntry } from "./catalog";
import { DEFAULT_CALIBRATION, SINGLE_LINE_NCU } from "./config";
import {
  createGuardContext,
  evaluateCandidateGuardrails,
  validateRewrite,
  type GuardContext,
} from "./guardrails";
import { computeVisualWidth, fitBulletToCalibratedLineArea } from "./text";
import type {
  CalibrationConfig,
  CandidateBulletSlot,
  ContainerCandidate,
  LarpTierClassification,
  LineBudgetCheck,
  MalleableBulletOption,
  ViolationCode,
  WordReframeStats,
} from "./types";

export const PROMPT_VERSION = "larp-v2.1";
export const DEFAULT_LLM_MODEL =
  (typeof process !== "undefined" && process.env?.LARP_LLM_MODEL) || "gemini-2.5-flash";

export type Completer = (prompt: string) => Promise<string>;

export interface LlmTelemetry {
  callsAttempted: number;
  callsSucceeded: number;
  cacheHits: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  totalLatencyMs: number;
  model: string;
  promptVersion: string;
}

export interface LlmValidatedCandidate {
  slot: CandidateBulletSlot;
  keyword: string;
  mutatedMarkup: string;
  reason: string;
  baseScore: number;
  score: number;
  budget: LineBudgetCheck;
  wordStats: WordReframeStats;
  source: "llm";
}

const rewriteCache = new Map<string, string[]>();

export function clearLlmRewriteCache(): void {
  rewriteCache.clear();
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Builds the strict prompt contract for rewriting a single bullet to include `keyword` (`**Keyword**`).
 */
export function buildBulletRewritePrompt(params: {
  bulletMarkup: string;
  keywordLabel: string;
  containerTitle: string;
  containerStack: string[];
  domainTags: string[];
  referenceBullets: string[];
  forbiddenList: string[];
  maxCharsBudget: number;
}): string {
  const {
    bulletMarkup,
    keywordLabel,
    containerTitle,
    containerStack,
    domainTags,
    referenceBullets,
    forbiddenList,
    maxCharsBudget,
  } = params;

  const refBlock =
    referenceBullets.length > 0
      ? referenceBullets.map((b, i) => `  ${i + 1}. ${b}`).join("\n")
      : `  1. ${bulletMarkup}`;

  return [
    `You are a surgical technical resume editor.`,
    `Task: Rewrite the single resume bullet below so it naturally incorporates the keyword **${keywordLabel}** (wrapped in double-asterisk bold markers).`,
    ``,
    `Context:`,
    `- Role / Project: ${containerTitle}`,
    `- Existing Stack: ${containerStack.join(", ") || "N/A"}`,
    `- Domain Tags: ${domainTags.join(", ") || "general"}`,
    `- Style Reference Bullets from this resume:`,
    refBlock,
    ``,
    `Original Bullet:`,
    `${bulletMarkup}`,
    ``,
    `Strict Non-Negotiable Constraints:`,
    `1. Include **${keywordLabel}** in bold markers, describing how the existing work was done (a rewording of existing work, NEVER a new accomplishment).`,
    `2. Change at most 7 words from the original bullet.`,
    `3. Keep every number, metric, and percentage from the original bullet EXACTLY as written.`,
    `4. Do NOT introduce any other technology. NEVER mention any item from this forbidden list: ${
      forbiddenList.slice(0, 40).join(", ") || "none"
    }.`,
    `5. Stay strictly under ${maxCharsBudget} characters in plain text.`,
    `6. Return JSON ONLY with 3 to 5 distinct phrasing options: {"rewrites":["...","...","..."]}`,
  ].join("\n");
}

/**
 * Builds the prompt contract for drafting new 1-line malleable bullets for a container.
 */
export function buildMalleableDraftPrompt(params: {
  container: ContainerCandidate;
  targetKeywords: string[];
  forbiddenList: string[];
  oneLineMaxChars: number;
}): string {
  const { container, targetKeywords, forbiddenList, oneLineMaxChars } = params;
  return [
    `You are a surgical technical resume editor.`,
    `Task: Draft 3 distinct, modest 1-line resume bullets for the role/project below.`,
    ``,
    `Context:`,
    `- Role / Project: ${container.title}`,
    `- Existing Stack: ${container.techSignals.join(", ") || "N/A"}`,
    `- Domain Tags: ${container.tags.join(", ")}`,
    `- Existing Bullets (do NOT duplicate these):`,
    ...container.existingBullets.map((b, i) => `  ${i + 1}. ${b}`),
    `- Target Keyword(s) to weave in naturally (in **bold**): ${targetKeywords.join(", ")}`,
    ``,
    `Strict Non-Negotiable Constraints:`,
    `1. Each bullet must fit on 1 line: between ${Math.ceil(oneLineMaxChars * 0.82)} and ${oneLineMaxChars} characters in plain text.`,
    `2. Do NOT introduce any technology beyond [${targetKeywords.join(", ")}] and the container's existing stack [${container.techSignals.join(", ")}].`,
    `3. NEVER mention any item from this forbidden list: ${forbiddenList.slice(0, 40).join(", ") || "none"}.`,
    `4. Do NOT duplicate existing bullets (word overlap must be low).`,
    `5. Return JSON ONLY: {"rewrites":["...","...","..."]}`,
  ].join("\n");
}

/**
 * Defensively parses `{"rewrites": [...]}` from an LLM response string, stripping markdown code fences.
 */
export function parseLlmRewritesJson(rawResponse: string): string[] {
  if (!rawResponse || typeof rawResponse !== "string") return [];
  try {
    const stripped = rawResponse
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const jsonStart = stripped.indexOf("{");
    const jsonEnd = stripped.lastIndexOf("}");
    const candidateJson =
      jsonStart >= 0 && jsonEnd > jsonStart ? stripped.slice(jsonStart, jsonEnd + 1) : stripped;

    const parsed = JSON.parse(candidateJson) as { rewrites?: unknown };
    if (!parsed || !Array.isArray(parsed.rewrites)) return [];

    return parsed.rewrites
      .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      .map((r) => r.trim())
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function callCompleterWithRetryAndTimeout(
  completer: Completer,
  prompt: string,
  timeoutMs = 8000
): Promise<string | null> {
  const attemptOnce = async (): Promise<string> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
    });
    try {
      return await Promise.race([completer(prompt), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    return await attemptOnce();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|5\d\d|rate|temporar/i.test(msg)) {
      try {
        return await attemptOnce();
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Shortlists the top `maxSlots` (default 4) plausible slots for a keyword based on domain overlap,
 * `pairsWith` hit, and recency.
 */
export function shortlistPlausibleSlotsForKeyword(
  slots: CandidateBulletSlot[],
  keyword: string,
  maxSlots = 4
): CandidateBulletSlot[] {
  const scored: { slot: CandidateBulletSlot; rankScore: number }[] = [];

  slots.forEach((slot, idx) => {
    const p = checkSlotPlausibility(slot, keyword);
    if (!p.ok) return;

    let rankScore = 50;
    if (p.pairsWithHit) rankScore += 25;
    if (p.contextOverlap) rankScore += 15;
    rankScore += Math.max(0, 10 - idx); // Recency preference
    rankScore += Math.min(8, Math.max(0, slot.charSlack / 8));

    scored.push({ slot, rankScore });
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, maxSlots).map((s) => s.slot);
}

/**
 * Runs concurrency-capped LLM proposals across shortlisted `(slot, keyword)` pairs,
 * compresses overflows via `fitBulletToCalibratedLineArea`, and validates every option
 * through `validateRewrite` (Phase 4 guardrails).
 */
export async function proposeAndValidateLlmBulletCandidates(params: {
  slots: CandidateBulletSlot[];
  keywords: string[];
  tiers: LarpTierClassification;
  cal: CalibrationConfig;
  completer: Completer;
  model?: string;
  concurrencyCap?: number;
  maxSlotsPerKeyword?: number;
  guardCtx?: GuardContext;
  rejectionCountsByKeyword?: Map<string, Partial<Record<ViolationCode, number>>>;
}): Promise<{ candidates: LlmValidatedCandidate[]; telemetry: LlmTelemetry }> {
  const {
    slots,
    keywords,
    tiers,
    cal,
    completer,
    model = DEFAULT_LLM_MODEL,
    concurrencyCap = 4,
    maxSlotsPerKeyword = 4,
    guardCtx,
    rejectionCountsByKeyword,
  } = params;

  const ctx = guardCtx ?? createGuardContext(tiers, cal, undefined, 7, SINGLE_LINE_NCU);
  const forbiddenList = Array.from(new Set([...ctx.blocked, ...ctx.skillsOnly]));
  const referenceBullets = slots.slice(0, 2).map((s) => s.bullet.text);

  const telemetry: LlmTelemetry = {
    callsAttempted: 0,
    callsSucceeded: 0,
    cacheHits: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    totalLatencyMs: 0,
    model,
    promptVersion: PROMPT_VERSION,
  };

  interface Task {
    slot: CandidateBulletSlot;
    keyword: string;
    pairsWithHit: boolean;
  }

  const tasks: Task[] = [];
  for (const keyword of keywords) {
    const shortlisted = shortlistPlausibleSlotsForKeyword(slots, keyword, maxSlotsPerKeyword);
    for (const slot of shortlisted) {
      const p = checkSlotPlausibility(slot, keyword);
      tasks.push({ slot, keyword, pairsWithHit: p.pairsWithHit });
    }
  }

  const candidates: LlmValidatedCandidate[] = [];

  for (let i = 0; i < tasks.length; i += concurrencyCap) {
    const batch = tasks.slice(i, i + concurrencyCap);
    const batchResults = await Promise.all(
      batch.map(async ({ slot, keyword, pairsWithHit }) => {
        const entry = findCatalogEntry(keyword);
        const keywordLabel = entry?.label ?? keyword;
        const cacheKey = simpleHash(
          `${slot.bullet.text}|${keywordLabel}|${model}|${PROMPT_VERSION}`
        );

        let rawRewrites = rewriteCache.get(cacheKey);
        if (rawRewrites) {
          telemetry.cacheHits++;
        } else {
          const prompt = buildBulletRewritePrompt({
            bulletMarkup: slot.bullet.text,
            keywordLabel,
            containerTitle: slot.containerTitle,
            containerStack: slot.containerStack ?? slot.bullet.tools,
            domainTags: slot.tags,
            referenceBullets,
            forbiddenList,
            maxCharsBudget: slot.maxAllowedChars,
          });

          telemetry.callsAttempted++;
          telemetry.estimatedPromptTokens += Math.ceil(prompt.length / 4);
          const t0 = Date.now();
          const resp = await callCompleterWithRetryAndTimeout(completer, prompt);
          telemetry.totalLatencyMs += Date.now() - t0;

          if (!resp) return [];
          telemetry.callsSucceeded++;
          telemetry.estimatedCompletionTokens += Math.ceil(resp.length / 4);
          rawRewrites = parseLlmRewritesJson(resp);
          if (rawRewrites.length > 0) {
            rewriteCache.set(cacheKey, rawRewrites);
          }
        }

        const validForSlot: LlmValidatedCandidate[] = [];
        const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());

        for (const rawOption of rawRewrites) {
          // Step 7.4.1: compressUntilFits if it overflows
          const fitted = fitBulletToCalibratedLineArea(rawOption, cal);

          // Step 7.4.2: validateRewrite (all Phase 4 checks)
          const guard = evaluateCandidateGuardrails(
            slot.bullet.text,
            fitted,
            bannedLower,
            cal,
            SINGLE_LINE_NCU,
            7,
            keywordLabel,
            ctx
          );

          if (!guard.valid || !guard.budget || !guard.wordStats) {
            if (rejectionCountsByKeyword) {
              const kwKey = keywordLabel.toLowerCase();
              const counts = rejectionCountsByKeyword.get(kwKey) ?? {};
              for (const v of guard.violations ?? []) {
                counts[v.code] = (counts[v.code] ?? 0) + 1;
              }
              rejectionCountsByKeyword.set(kwKey, counts);
            }
            continue;
          }

          // Step 7.4.4: Score with baseScore = 80 and source = 'llm'
          const baseScore = 80;
          const greenBonus = guard.budget.candFit.tone === "green" ? 12 : 0;
          const pairsBonus = pairsWithHit ? 10 : 0;
          const totalScore =
            baseScore +
            slot.defensibilityBonus +
            greenBonus +
            pairsBonus +
            Math.min(8, slot.charSlack / 6);

          validForSlot.push({
            slot,
            keyword: keywordLabel,
            mutatedMarkup: fitted,
            reason: `LLM-proposed surgical reframe incorporating ${keywordLabel}`,
            baseScore,
            score: totalScore,
            budget: guard.budget,
            wordStats: guard.wordStats,
            source: "llm",
          });
        }

        return validForSlot;
      })
    );

    for (const list of batchResults) {
      candidates.push(...list);
    }
  }

  return { candidates, telemetry };
}

export function wordJaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    plainText(a)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    plainText(b)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Optional LLM path for drafting new 1-line malleable bullets for a container.
 * Enforces: 1 line only, no new tech beyond target keywords + container stack,
 * word-overlap Jaccard <= 0.5 against existing bullets, and `isNewClaim: true`.
 */
export async function draftAndValidateLlmMalleableOptions(params: {
  container: ContainerCandidate;
  containerIdx: number;
  targetKeywords: string[];
  tiers: LarpTierClassification;
  cal?: CalibrationConfig;
  completer: Completer;
  guardCtx?: GuardContext;
}): Promise<MalleableBulletOption[]> {
  const {
    container,
    containerIdx,
    targetKeywords,
    tiers,
    cal = DEFAULT_CALIBRATION,
    completer,
    guardCtx,
  } = params;

  const oneLineMax = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const ctx = guardCtx ?? createGuardContext(tiers, cal, undefined, 25, SINGLE_LINE_NCU);
  const forbiddenList = Array.from(new Set([...ctx.blocked, ...ctx.skillsOnly]));

  const prompt = buildMalleableDraftPrompt({
    container,
    targetKeywords,
    forbiddenList,
    oneLineMaxChars: oneLineMax,
  });

  const resp = await callCompleterWithRetryAndTimeout(completer, prompt);
  if (!resp) return [];

  const rawOptions = parseLlmRewritesJson(resp);
  const allowedBaselineMarkup = [...container.techSignals, ...targetKeywords].join(" ");
  const validOptions: MalleableBulletOption[] = [];

  rawOptions.forEach((raw, idx) => {
    const fitted = fitBulletToCalibratedLineArea(raw, cal);
    const plain = plainText(fitted).trim();

    // Must be 1 line only
    if (plain.length === 0 || plain.length > oneLineMax) return;

    // Must not duplicate existing bullets (Jaccard <= 0.5)
    const duplicatesExisting = container.existingBullets.some(
      (eb) => wordJaccardSimilarity(eb, plain) > 0.5
    );
    if (duplicatesExisting) return;

    // Check against banned_term and new_tech using validateRewrite against synthetic baseline
    const primaryTarget = targetKeywords[0] ?? container.techSignals[0] ?? "";
    const violations = validateRewrite(allowedBaselineMarkup, fitted, primaryTarget, ctx).filter(
      (v) => v.code === "banned_term" || v.code === "new_tech"
    );
    if (violations.length > 0) return;

    const latex = `\\item ${markupToLatex(fitted)}`;
    validOptions.push({
      id: `malleable-${containerIdx + 1}-llm-${idx + 1}`,
      styleLabel: "LLM Contextual Draft",
      markup: fitted,
      latex,
      chars: plain.length,
      maxChars: oneLineMax,
      widthNcu: computeVisualWidth(latex),
      fit: bulletFit(fitted, cal),
      easyExplanation: "Context-grounded 1-line bullet drafted and guardrail-verified.",
      isNewClaim: true,
      source: "llm",
    });
  });

  return validOptions;
}
