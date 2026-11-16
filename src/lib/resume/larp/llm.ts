import { markupToLatex } from "../latex";
import { bulletFit, plainText } from "../utils";
import { checkSlotPlausibility, tryMinimalKeywordInjection } from "./candidates";
import { findCatalogEntry } from "./catalog";
import { DEFAULT_CALIBRATION, SINGLE_LINE_NCU } from "./config";
import {
  createGuardContext,
  evaluateCandidateGuardrails,
  extractMetricsAndNumbers,
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
  MasterResume,
  ViolationCode,
  WordReframeStats,
} from "./types";

export interface LlmRequest {
  bullet: string;
  keyword: string;
  containerTitle: string;
  stack: string[];
  tags: string[];
  styleRefs: string[]; // 1-2 other bullets from the same container
  forbidden: string[]; // tier-2 and tier-1.5 labels not already on the resume
  maxWordChanges: number;
  maxChars: number;
}

export interface Prompt {
  system: string;
  user: string;
}

export type Completer = (p: Prompt & { temperature: number }) => Promise<string>;

export const PROMPT_VERSION = "rewrite-v1";
export const DEFAULT_LLM_MODEL =
  (typeof process !== "undefined" &&
    (process.env?.LARP_MODEL || process.env?.LARP_LLM_MODEL)) ||
  "gemini-2.5-flash";

export const SYSTEM = `You are an editor for resume bullet points. You rewrite ONE bullet so it naturally mentions ONE given technology.
Hard rules:
1. Change at most N words (N is given). Prefer swapping or adding 2-5 words over restructuring.
2. Keep every number, percentage and metric exactly as written.
3. Mention only the given technology. Do not add any other tool, language, framework or service. Never mention anything on the forbidden list.
4. Wrap the technology in **double asterisks**, e.g. **Redis**. Keep any existing **bold** markers.
5. The technology must describe HOW the existing work was done or where it ran. Do not add a new accomplishment, metric, scope or responsibility.
6. Match the voice of the style examples: same tense, same terse past-tense verbs, no filler clauses, no buzzwords.
7. Stay under the character limit. One sentence, ends with a period.
8. The 3-5 rewrites must differ from each other in placement or phrasing, not just punctuation.
Output JSON only: {"rewrites":["...","...","..."]}`;

export const EXAMPLES = `Examples (format only):
Bullet: Built **REST APIs** serving 40 clients across 5 internal services.
Technology: Redis | N=7
{"rewrites":["Built **REST APIs** serving 40 clients across 5 internal services with **Redis** caching.","Built cached **REST APIs** on **Redis** serving 40 clients across 5 internal services."]}`;

export const buildPrompt = (r: LlmRequest): Prompt => ({
  system: SYSTEM,
  user: `${EXAMPLES}

Now the real task.
Role/project: ${r.containerTitle}
Stack already used here: ${r.stack.join(", ") || "n/a"}
Domain: ${r.tags.join(", ") || "general"}
Style examples from the same role:
${r.styleRefs.map((s) => `- ${s}`).join("\n") || "- n/a"}
Forbidden: ${r.forbidden.join(", ") || "none"}
Bullet: ${r.bullet}
Technology: ${r.keyword} | N=${r.maxWordChanges} | max ${r.maxChars} characters`,
});

export function parseRewrites(raw: string): string[] {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const jsonSlice =
      jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
    const arr = JSON.parse(jsonSlice)?.rewrites;
    return Array.isArray(arr)
      ? [
          ...new Set(
            arr.filter(
              (x): x is string => typeof x === "string" && x.length > 10 && x.length < 400
            )
          ),
        ].slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export const parseLlmRewritesJson = parseRewrites;

export function pLimit(n: number) {
  let active = 0;
  const q: (() => void)[] = [];
  const next = () => {
    active--;
    q.shift()?.();
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((res, rej) => {
      const run = () => {
        active++;
        fn().then(res, rej).finally(next);
      };
      active < n ? run() : q.push(run);
    });
}

const limit = pLimit(4);

/** Fail-soft: a timeout, 429 or bad JSON yields [], never a broken run. */
export const proposeWithLlm = (
  complete: Completer,
  r: LlmRequest,
  timeoutMs = 8000
): Promise<string[]> =>
  limit(async () => {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const raw = await Promise.race([
        complete({ ...buildPrompt(r), temperature: 0.7 }),
        new Promise<string>((_, rej) => {
          timer = setTimeout(() => rej(new Error("timeout")), timeoutMs);
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      return parseRewrites(raw);
    } catch {
      return [];
    }
  });

/**
 * Browser client completer that calls `/api/larp/propose`.
 */
export const apiCompleter: Completer = async (p) => {
  const res = await fetch("/api/larp/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`propose ${res.status}`);
  return (await res.json()).text as string;
};

/* ============================================================================
 * OPTIONAL NATURALNESS JUDGE (RANK ONLY — POST-GUARDRAILS)
 * ============================================================================ */

export const JUDGE_SYSTEM = `You rate resume bullet edits. For each candidate, rate 1-5 how much it reads like something the author originally wrote: 5 = seamless and natural, 1 = obviously bolted on or awkward. Judge wording only. Output JSON only: {"scores":[n,...]} in the same order as the candidates.`;

export async function judge(
  complete: Completer,
  original: string,
  cands: string[]
): Promise<number[]> {
  try {
    const raw = await complete({
      system: JUDGE_SYSTEM,
      temperature: 0,
      user:
        `Original: ${original}\n` +
        cands.map((c, i) => `Candidate ${i + 1}: ${c}`).join("\n"),
    });
    const s = JSON.parse(raw.replace(/```json|```/g, "").trim())?.scores;
    return Array.isArray(s) && s.length === cands.length
      ? s.map((x) => Math.max(1, Math.min(5, Number(x) || 3)))
      : cands.map(() => 3);
  } catch {
    return cands.map(() => 3);
  }
}

/* ============================================================================
 * OPTIONAL NEW-BULLET DRAFTER (MALLEABLE PATH)
 * ============================================================================ */

export const DRAFT_SYSTEM = `You draft ONE new one-line resume bullet for a given role or project, in the same voice as its existing bullets.
Rules: past tense, one line under the character limit, ends with a period; mention only the given technology plus tools already in the stack; no new metrics or numbers; describe a small, modest piece of work (integration, config, testing, caching, tooling); do not repeat or paraphrase an existing bullet; wrap the technology in **double asterisks**.
Output JSON only: {"rewrites":["...","...","..."]}`;

export interface LlmTelemetry {
  callsAttempted: number;
  callsSucceeded: number;
  cacheHits: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  totalLatencyMs: number;
  proposedCount: number;
  survivedCount: number;
  survivalRate: number;
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
  llmRating?: number;
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
    rankScore += Math.max(0, 10 - idx);
    rankScore += Math.min(8, Math.max(0, slot.charSlack / 8));

    scored.push({ slot, rankScore });
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, maxSlots).map((s) => s.slot);
}

function getStyleRefsForSlot(slot: CandidateBulletSlot, resume?: MasterResume): string[] {
  if (!resume) return [];
  if (slot.containerKind === "experience") {
    const job = resume.experience.find((j) => j.id === slot.containerId);
    if (!job) return [];
    return job.bullets
      .filter((b) => b.id !== slot.bullet.id)
      .slice(0, 2)
      .map((b) => b.text);
  }
  const proj = resume.projects.find((p) => p.id === slot.containerId);
  if (!proj) return [];
  return proj.bullets
    .filter((b) => b.id !== slot.bullet.id)
    .slice(0, 2)
    .map((b) => b.text);
}

export function buildForbiddenLabelsList(ctx: GuardContext): string[] {
  const labels = new Set<string>();
  for (const entry of ctx.matchers) {
    if (
      ctx.blocked.has(entry.id.toLowerCase()) ||
      ctx.blocked.has(entry.label.toLowerCase()) ||
      ctx.skillsOnly.has(entry.id.toLowerCase()) ||
      ctx.skillsOnly.has(entry.label.toLowerCase())
    ) {
      labels.add(entry.label);
    }
  }
  return Array.from(labels);
}

/**
 * Runs concurrency-capped LLM proposals across shortlisted `(slot, keyword)` pairs,
 * compresses overflows via `fitBulletToCalibratedLineArea`, and validates every option
 * through `validateRewrite` (Phase 4 guardrails).
 * Note: The JD text is NEVER passed into the prompt to prevent prompt injection and maximize cacheability.
 */
export async function proposeAndValidateLlmBulletCandidates(params: {
  slots: CandidateBulletSlot[];
  keywords: string[];
  tiers: LarpTierClassification;
  cal: CalibrationConfig;
  completer: Completer;
  resume?: MasterResume;
  model?: string;
  maxSlotsPerKeyword?: number;
  maxTotalCalls?: number;
  skipWhenSpecificRuleFits?: boolean;
  enableJudge?: boolean;
  guardCtx?: GuardContext;
  rejectionCountsByKeyword?: Map<string, Partial<Record<ViolationCode, number>>>;
}): Promise<{ candidates: LlmValidatedCandidate[]; telemetry: LlmTelemetry }> {
  const {
    slots,
    keywords,
    tiers,
    cal,
    completer,
    resume,
    model = DEFAULT_LLM_MODEL,
    maxSlotsPerKeyword = 2,
    maxTotalCalls = 6,
    skipWhenSpecificRuleFits = true,
    enableJudge = false,
    guardCtx,
    rejectionCountsByKeyword,
  } = params;

  const ctx = guardCtx ?? createGuardContext(tiers, cal, undefined, 7, SINGLE_LINE_NCU);
  const forbidden = buildForbiddenLabelsList(ctx);
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());

  const telemetry: LlmTelemetry = {
    callsAttempted: 0,
    callsSucceeded: 0,
    cacheHits: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    totalLatencyMs: 0,
    proposedCount: 0,
    survivedCount: 0,
    survivalRate: 0,
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
    if (tasks.length >= maxTotalCalls) break;

    // Token-saving optimization: if a specific hand-written rule already produces a valid green 1L/2L fit for this keyword,
    // skip calling the LLM unless there are fewer than 2 total tasks so far.
    if (skipWhenSpecificRuleFits && slots.length > 1) {
      const hasStrongRule = slots.some((slot) => {
        const p = checkSlotPlausibility(slot, keyword);
        if (!p.ok) return false;
        const attempt = tryMinimalKeywordInjection(slot.bullet.text, slot.context, keyword, false);
        if (!attempt || attempt.fitScore < 90) return false;
        const fitted = fitBulletToCalibratedLineArea(attempt.mutatedMarkup, cal);
        const guard = evaluateCandidateGuardrails(
          slot.bullet.text,
          fitted,
          bannedLower,
          cal,
          SINGLE_LINE_NCU,
          ctx.maxWordsCap,
          keyword,
          ctx
        );
        return Boolean(guard.valid && guard.budget?.candFit.tone === "green");
      });
      if (hasStrongRule) continue;
    }

    const shortlisted = shortlistPlausibleSlotsForKeyword(slots, keyword, maxSlotsPerKeyword);
    for (const slot of shortlisted) {
      if (tasks.length >= maxTotalCalls) break;
      const p = checkSlotPlausibility(slot, keyword);
      tasks.push({ slot, keyword, pairsWithHit: p.pairsWithHit });
    }
  }

  const batchResults = await Promise.all(
    tasks.map(async ({ slot, keyword, pairsWithHit }) => {
      const entry = findCatalogEntry(keyword);
      const keywordLabel = entry?.label ?? keyword;
      const styleRefs = getStyleRefsForSlot(slot, resume);

      const req: LlmRequest = {
        bullet: slot.bullet.text,
        keyword: keywordLabel,
        containerTitle: slot.containerTitle,
        stack: slot.containerStack ?? slot.bullet.tools,
        tags: slot.tags,
        styleRefs,
        forbidden,
        maxWordChanges: ctx.maxWordsCap,
        maxChars: slot.maxAllowedChars,
      };

      const promptObj = buildPrompt(req);
      const cacheKey = simpleHash(
        `${MODEL_KEY_PREFIX(model)}|${PROMPT_VERSION}|${promptObj.system}|${promptObj.user}`
      );

      let rawRewrites = rewriteCache.get(cacheKey);
      if (rawRewrites) {
        telemetry.cacheHits++;
      } else {
        telemetry.callsAttempted++;
        telemetry.estimatedPromptTokens += Math.ceil(
          (promptObj.system.length + promptObj.user.length) / 4
        );
        const t0 = Date.now();
        rawRewrites = await proposeWithLlm(completer, req);
        telemetry.totalLatencyMs += Date.now() - t0;

        if (rawRewrites.length > 0) {
          telemetry.callsSucceeded++;
          telemetry.estimatedCompletionTokens += Math.ceil(
            rawRewrites.join(" ").length / 4
          );
          rewriteCache.set(cacheKey, rawRewrites);
        }
      }

      telemetry.proposedCount += rawRewrites.length;

      const validForSlot: LlmValidatedCandidate[] = [];
      const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());

      for (const rawOption of rawRewrites) {
        const fitted = fitBulletToCalibratedLineArea(rawOption, cal);
        const guard = evaluateCandidateGuardrails(
          slot.bullet.text,
          fitted,
          bannedLower,
          cal,
          SINGLE_LINE_NCU,
          ctx.maxWordsCap,
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

      if (enableJudge && validForSlot.length > 0) {
        const top3 = validForSlot.slice(0, 3);
        const ratings = await judge(
          completer,
          slot.bullet.text,
          top3.map((c) => c.mutatedMarkup)
        );
        top3.forEach((cand, idx) => {
          const rating = ratings[idx] ?? 3;
          cand.llmRating = rating;
          cand.score += (rating - 3) * 4;
        });
      }

      telemetry.survivedCount += validForSlot.length;
      return validForSlot;
    })
  );

  const candidates = batchResults.flat();
  telemetry.survivalRate =
    telemetry.proposedCount > 0
      ? Number((telemetry.survivedCount / telemetry.proposedCount).toFixed(2))
      : 0;

  return { candidates, telemetry };
}

function MODEL_KEY_PREFIX(model: string): string {
  return model.trim().toLowerCase();
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
 * Optional LLM path for drafting new 1-line malleable bullets for a container using `DRAFT_SYSTEM`.
 * Enforces: 1 line only, techIds subset of `{target} U stack`, no new metrics/numbers,
 * word-overlap Jaccard <= 0.5 against existing bullets, `isNewClaim: true`, and `source: 'llm'`.
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
  const forbidden = buildForbiddenLabelsList(ctx);
  const primaryTarget = targetKeywords[0] ?? container.techSignals[0] ?? "";

  const userPrompt = [
    `Role/project: ${container.title}`,
    `Stack: ${container.techSignals.join(", ") || "n/a"}`,
    `Domain: ${container.tags.join(", ") || "general"}`,
    `Existing bullets:`,
    ...container.existingBullets.map((b) => `- ${b}`),
    `Forbidden: ${forbidden.join(", ") || "none"}`,
    `Technology: ${primaryTarget} | max ${oneLineMax} characters`,
  ].join("\n");

  let rawOptions: string[] = [];
  try {
    const raw = await limit(() =>
      Promise.race([
        completer({ system: DRAFT_SYSTEM, user: userPrompt, temperature: 0.7 }),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ])
    );
    rawOptions = parseRewrites(raw);
  } catch {
    return [];
  }

  const allowedBaselineMarkup = [...container.techSignals, ...targetKeywords].join(" ");
  const validOptions: MalleableBulletOption[] = [];

  rawOptions.forEach((raw, idx) => {
    const fitted = fitBulletToCalibratedLineArea(raw, cal);
    const plain = plainText(fitted).trim();
    const fit = bulletFit(fitted, cal);

    // 1. Must be 1 line only
    if (plain.length === 0 || plain.length > oneLineMax || fit.targetLines !== 1) return;

    // 2. No new metrics or numbers
    if (extractMetricsAndNumbers(fitted).length > 0) return;

    // 3. Must not duplicate existing bullets (Jaccard <= 0.5)
    const duplicatesExisting = container.existingBullets.some(
      (eb) => wordJaccardSimilarity(eb, plain) > 0.5
    );
    if (duplicatesExisting) return;

    // 4. Tech subset of {target} U stack (no banned_term or new_tech)
    const violations = validateRewrite(allowedBaselineMarkup, fitted, primaryTarget, ctx).filter(
      (v) => v.code === "banned_term" || v.code === "new_tech" || v.code === "missing_keyword"
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
      fit,
      easyExplanation: "Context-grounded 1-line bullet drafted by AI and guardrail-verified.",
      isNewClaim: true,
      source: "llm",
    });
  });

  return validOptions;
}
