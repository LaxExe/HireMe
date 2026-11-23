import { markupToLatex } from "../latex";
import { bulletFit, plainText } from "../utils";
import {
  checkEcosystemCompatibility,
  checkSlotPlausibility,
  tryMinimalKeywordInjection,
} from "./candidates";
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
  styleRefs: string[]; // other bullets from the same container
  forbidden: string[]; // tier-2, tier-1.5, and ecosystem-conflicting labels
  maxWordChanges: number;
  maxChars: number;
  /** Full role or project overview (title, company/project, dates, location/meta). */
  roleOverview?: string;
  /** Complete list of everything done in this role/project (all bullets in the container). */
  allRoleBullets?: string[];
  /** Specific tools and languages already present in the target bullet itself. */
  bulletTools?: string[];
  /** Key available JD/stack items that are ecosystem-compatible with this specific role and bullet. */
  availableRoleKeywords?: string[];
}

export interface Prompt {
  system: string;
  user: string;
}

export type Completer = (p: Prompt & { temperature: number }) => Promise<string>;

export const PROMPT_VERSION = "rewrite-v2-role-context";
export const DEFAULT_LLM_MODEL =
  (typeof process !== "undefined" &&
    (process.env?.LARP_MODEL || process.env?.LARP_LLM_MODEL)) ||
  "gemini-3.5-flash-lite";

export const SYSTEM = `You are a senior staff engineer editing a resume bullet point. You are given EVERYTHING done in a specific role or project (all bullets, full tech stack, and domain) and you must first decide if weaving the given technology into the target bullet genuinely makes technical and architectural sense, and ONLY if it makes 100% realistic engineering sense, rewrite the target bullet for yourself so it reads like the engineer originally wrote it.
Hard rules:
1. Sense & Believability Gate (IF AND ONLY IF IT MAKES SENSE): Evaluate whether the given technology naturally belongs in this specific bullet and role. If the technology does NOT make genuine technical sense in this specific bullet (e.g. forcing a frontend/CSS tool into a backend/ML pipeline, forcing an incompatible language/framework, or shoehorning an unrelated tool into a sentence where it sounds bolted-on or fake), DO NOT force it — return {"makesSense":false,"rewrites":[]}.
2. Rewrite the Bullet Yourself (No Lazy Tacked-On Suffixes): When the technology DOES make sense, rewrite the sentence structure yourself around the real engineering work of the role so the technology plays a real, believable technical role in the sentence. NEVER just slap a lazy suffix like ", using **X**" or "tracked in **X**" onto the end of an unrelated clause.
3. Read all bullets from the role/project first so your rewrite fits the exact system, architecture, and programming language built in that role.
4. Strict ecosystem & language coherence: NEVER mix incompatible language ecosystems (for example, never pair a Python/FastAPI/PyTorch bullet with Java, JUnit, Jest, C++, or React concepts; never pair a TypeScript/React bullet with Python/FastAPI/C++ tools; never pair a C++/ROS 2 bullet with web/JS/JVM tools).
5. For workflow/process terms (Agile, Jira, Linear, CI/CD, end-to-end), only inject if the bullet describes shipping services, releases, or team features — NEVER attach a project-management tool as an adjective onto a model, detector, algorithm, metric count, or database (never write "100 Jira-tracked interactions", "Jira-tracked detectors", or "Agile database"). If it cannot be woven naturally into how the work was shipped, return {"makesSense":false,"rewrites":[]}.
6. Change at most N words (N is given). When the original bullet is already near the character limit, tighten/shorten 2-4 verbose existing words while rewriting the point so the final bullet stays strictly within max characters (1-line bullets MUST stay <= max characters and never spill onto a 2nd line).
7. Keep every number, percentage and metric from the original bullet exactly as written.
8. Mention only the given technology (plus tools already in the original bullet). Do not add any other tool, language, framework or service. Never mention anything on the forbidden list.
9. Wrap the technology in **double asterisks**, e.g. **Redis**. Keep all existing **bold** markers on original tools and metrics.
10. Do not invent a new accomplishment, metric, or unrelated responsibility.
11. Match the voice of the role's bullets: same tense, same terse past-tense engineering verbs, no filler clauses, no buzzwords.
12. Stay strictly under the character limit. One sentence, ends with a period. Return 3 distinct rewrites when makesSense is true.
Output JSON only: {"makesSense":true,"rewrites":["...","...","..."]} or {"makesSense":false,"rewrites":[]}`;

export const EXAMPLES = `Examples (format only):
Bullet: Built **REST APIs** serving 40 clients across 5 internal services.
Technology: Redis | N=7
{"makesSense":true,"rewrites":["Built **REST APIs** with **Redis** caching serving 40 clients across 5 internal services.","Built **Redis**-backed **REST APIs** serving 40 clients across 5 internal services."]}
Bullet: Trained **PyTorch** segmentation models on **12,000** labeled frames.
Technology: React | N=7
{"makesSense":false,"rewrites":[]}`;

export const buildPrompt = (r: LlmRequest): Prompt => {
  const fullBulletsBlock =
    r.allRoleBullets && r.allRoleBullets.length > 0
      ? r.allRoleBullets.map((b, i) => `  ${i + 1}. ${b}`).join("\n")
      : r.styleRefs.map((s) => `- ${s}`).join("\n") || "- n/a";

  const bulletToolsLine =
    r.bulletTools && r.bulletTools.length > 0
      ? `\nTarget bullet existing tools/languages: ${r.bulletTools.join(", ")}`
      : "";

  const availableKeysLine =
    r.availableRoleKeywords && r.availableRoleKeywords.length > 0
      ? `\nKey available compatible items for this role: ${r.availableRoleKeywords.join(", ")}`
      : "";

  const origPlainLen = plainText(r.bullet).trim().length;
  const slack = r.maxChars - origPlainLen;
  const lineBudgetHint =
    r.roleOverview
      ? `\nLine budget: original is ${origPlainLen} plain chars; target MUST be <= ${r.maxChars} plain chars (${
          slack < 20
            ? `only ${Math.max(0, slack)} chars of slack — you MUST shorten/tighten 2-4 verbose words in the original sentence while weaving in **${r.keyword}** so the final bullet stays <= ${r.maxChars} chars`
            : `${slack} chars of free slack available`
        }).`
      : "";

  return {
    system: SYSTEM,
    user: `${EXAMPLES}

Now the real task.
Role/project: ${r.roleOverview || r.containerTitle}
Stack already used here: ${r.stack.join(", ") || "n/a"}
Domain: ${r.tags.join(", ") || "general"}${bulletToolsLine}${availableKeysLine}${lineBudgetHint}
Everything done in this role/project (full context & style):
${fullBulletsBlock}
Forbidden (never mention): ${r.forbidden.join(", ") || "none"}
Bullet: ${r.bullet}
Technology: ${r.keyword} | N=${r.maxWordChanges} | max ${r.maxChars} characters`,
  };
};

export function parseRewrites(raw: string): string[] {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const jsonSlice =
      jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
    const parsed = JSON.parse(jsonSlice);
    if (parsed && parsed.makesSense === false) {
      return [];
    }
    const arr = parsed?.rewrites;
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    try {
      const { auth } = await import("@/lib/firebase");
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // ignore if firebase auth is in local mode
    }
  }
  const res = await fetch("/api/larp/propose", {
    method: "POST",
    headers,
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

export const DRAFT_SYSTEM = `You draft 3 distinct new one-line resume bullets for a given role or project, based on EVERYTHING done in that role or project (all existing bullets, architecture, and stack).
Rules:
1. Sense & Believability Gate (IF AND ONLY IF IT MAKES SENSE): First check whether the target technology (or compatible role technologies) genuinely makes engineering sense for this specific role/project. If none of the target technologies make realistic sense for this role's architecture and domain, return {"makesSense":false,"rewrites":[]}.
2. Read all existing bullets in the role/project and write each new 1-line bullet yourself so it sounds like a direct, authentic engineering continuation of the specific system built there (e.g. referencing the actual domain such as voice agents, insurance/eligibility APIs, dataset annotation pipelines, or autonomous simulation).
3. Strict ecosystem & language coherence: ONLY use the given target technology (or key available compatible technologies listed for this role) plus tools/languages already used in this specific role's stack. NEVER introduce an incompatible language or framework (e.g. never pair a Python role with Java/Jest/C++/React; never pair a C++ role with web/JS/Java tools).
4. Past tense, one line strictly under the character limit (aim for 88-106 characters), ends with a period.
5. No new metrics or numbers; describe a concrete, defensible piece of engineering work (automated testing, schema/request validation, caching, CI checks, runtime/build tooling, or error handling) directly connected to the role's actual domain.
6. Do not repeat or paraphrase an existing bullet; wrap every technology name in **double asterisks**. Return 3 distinct options in the rewrites array.
Output JSON only: {"makesSense":true,"rewrites":["...","...","..."]} or {"makesSense":false,"rewrites":[]}`;

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
  maxSlots = 4,
  allowExtendedFallback = true,
  slotUsageCounts?: Map<string, number>
): CandidateBulletSlot[] {
  const scored: { slot: CandidateBulletSlot; rankScore: number }[] = [];

  slots.forEach((slot, idx) => {
    const p = checkSlotPlausibility(slot, keyword, allowExtendedFallback);
    if (!p.ok) return;

    let rankScore = 50;
    if (p.pairsWithHit) rankScore += 25;
    if (p.contextOverlap) rankScore += 15;
    const ruleAttempt = tryMinimalKeywordInjection(
      slot.bullet.text,
      slot.context,
      keyword,
      true,
      true
    );
    if (ruleAttempt) rankScore += 20;
    rankScore += Math.max(0, 10 - idx);
    rankScore += Math.min(8, Math.max(0, slot.charSlack / 8));
    if (slotUsageCounts) {
      const priorUses = slotUsageCounts.get(slot.bullet.id) ?? 0;
      rankScore -= priorUses * 18;
    }

    scored.push({ slot, rankScore });
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, maxSlots).map((s) => s.slot);
}

const PYTHON_ONLY_EXCLUSIONS = ["Java", "Spring Boot", "JUnit", "Kotlin", "Jest", "C++", "CMake", "ROS 2", "Gazebo"];
const JS_TS_ONLY_EXCLUSIONS = ["Java", "Spring Boot", "JUnit", "Kotlin", "FastAPI", "Flask", "PyTorch", "Pandas", "NumPy", "C++", "CMake", "ROS 2", "Gazebo"];
const CPP_ONLY_EXCLUSIONS = ["Java", "Spring Boot", "JUnit", "Jest", "TypeScript", "JavaScript", "React", "Next.js", "Node.js", "Express", "Tailwind CSS", "FastAPI", "Flask", "Supabase", "Firebase"];

export function buildEcosystemForbiddenForBullet(
  bulletText: string,
  bulletTools: string[],
  containerStack: string[],
  baseForbidden: string[]
): string[] {
  const combinedBullet = `${plainText(bulletText)} ${bulletTools.join(" ")}`.toLowerCase();
  const combinedStack = `${combinedBullet} ${containerStack.join(" ")}`.toLowerCase();
  const set = new Set(baseForbidden);

  const hasPy = /\b(?:python|fastapi|flask|django|pytorch|tensorflow|pandas|numpy|scikit-learn|opencv|slurm|sam\s*2|optuna)\b/i.test(combinedBullet);
  const hasJsTs = /\b(?:typescript|javascript|react|next\.js|node\.js|express|tailwind|redux|jest)\b/i.test(combinedBullet);
  const hasCpp = /(?:\bc\+\+|\b(?:cmake|ros\s*2|gazebo|cuda|lidar|embedded|firmware)\b)/i.test(combinedBullet);

  if (hasPy && !hasJsTs && !hasCpp) {
    for (const item of PYTHON_ONLY_EXCLUSIONS) set.add(item);
  } else if (hasJsTs && !hasPy && !hasCpp) {
    for (const item of JS_TS_ONLY_EXCLUSIONS) set.add(item);
  } else if (hasCpp && !hasPy && !hasJsTs) {
    for (const item of CPP_ONLY_EXCLUSIONS) set.add(item);
  }

  if (!/\b(?:java|spring|kotlin|scala|junit)\b/i.test(combinedStack)) {
    set.add("Java");
    set.add("Spring Boot");
    set.add("JUnit");
    set.add("Kotlin");
  }

  return Array.from(set);
}

function getFullRoleContextForSlot(
  slot: CandidateBulletSlot,
  resume: MasterResume | undefined,
  allCandidateKeywords: string[],
  baseForbidden: string[]
): {
  roleOverview: string;
  allRoleBullets: string[];
  styleRefs: string[];
  fullStack: string[];
  bulletTools: string[];
  availableRoleKeywords: string[];
  forbidden: string[];
} {
  let roleOverview = slot.containerTitle;
  let allRoleBullets: string[] = [slot.bullet.text];
  let styleRefs: string[] = [];
  const stackSet = new Set<string>(slot.containerStack ?? []);
  for (const t of slot.bullet.tools) stackSet.add(t);

  if (resume) {
    if (slot.containerKind === "experience") {
      const job = resume.experience.find((j) => j.id === slot.containerId);
      if (job) {
        const metaParts = [job.company, job.location, job.dates].filter(Boolean);
        roleOverview = `${job.title}${metaParts.length > 0 ? ` · ${metaParts.join(" · ")}` : ""}`;
        allRoleBullets = job.bullets.map((b) =>
          b.id === slot.bullet.id ? `[TARGET BULLET] ${b.text}` : b.text
        );
        styleRefs = job.bullets
          .filter((b) => b.id !== slot.bullet.id)
          .map((b) => b.text);
        for (const b of job.bullets) {
          for (const t of b.tools) stackSet.add(t);
        }
      }
    } else {
      const proj = resume.projects.find((p) => p.id === slot.containerId);
      if (proj) {
        const metaParts = [
          proj.meta,
          proj.techStack.length > 0 ? `Stack: ${proj.techStack.join(", ")}` : "",
        ].filter(Boolean);
        roleOverview = `${proj.name}${metaParts.length > 0 ? ` (${metaParts.join(" · ")})` : ""}`;
        allRoleBullets = proj.bullets.map((b) =>
          b.id === slot.bullet.id ? `[TARGET BULLET] ${b.text}` : b.text
        );
        styleRefs = proj.bullets
          .filter((b) => b.id !== slot.bullet.id)
          .map((b) => b.text);
        for (const t of proj.techStack) stackSet.add(t);
        for (const b of proj.bullets) {
          for (const t of b.tools) stackSet.add(t);
        }
      }
    }
  }

  const fullStack = Array.from(stackSet);
  const availableRoleKeywords = allCandidateKeywords.filter((kw) =>
    checkEcosystemCompatibility(slot.bullet.text, slot.bullet.tools, fullStack, kw)
  );
  const forbidden = buildEcosystemForbiddenForBullet(
    slot.bullet.text,
    slot.bullet.tools,
    fullStack,
    baseForbidden
  );

  return {
    roleOverview,
    allRoleBullets,
    styleRefs,
    fullStack,
    bulletTools: slot.bullet.tools,
    availableRoleKeywords,
    forbidden,
  };
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
    maxSlotsPerKeyword = 4,
    maxTotalCalls = 18,
    skipWhenSpecificRuleFits = false,
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
  const slotUsageCounts = new Map<string, number>();
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

    const shortlisted = shortlistPlausibleSlotsForKeyword(
      slots,
      keyword,
      maxSlotsPerKeyword,
      true,
      slotUsageCounts
    );
    for (const slot of shortlisted) {
      if (tasks.length >= maxTotalCalls) break;
      const p = checkSlotPlausibility(slot, keyword, true);
      tasks.push({ slot, keyword, pairsWithHit: p.pairsWithHit });
      slotUsageCounts.set(slot.bullet.id, (slotUsageCounts.get(slot.bullet.id) ?? 0) + 1);
    }
  }

  const batchResults = await Promise.all(
    tasks.map(async ({ slot, keyword, pairsWithHit }) => {
      const entry = findCatalogEntry(keyword);
      const keywordLabel = entry?.label ?? keyword;
      const roleCtx = getFullRoleContextForSlot(slot, resume, keywords, forbidden);

      const req: LlmRequest = {
        bullet: slot.bullet.text,
        keyword: keywordLabel,
        containerTitle: slot.containerTitle,
        stack: roleCtx.fullStack.length > 0 ? roleCtx.fullStack : slot.bullet.tools,
        tags: slot.tags,
        styleRefs: roleCtx.styleRefs,
        forbidden: roleCtx.forbidden,
        maxWordChanges: ctx.maxWordsCap,
        maxChars: slot.maxAllowedChars,
        roleOverview: roleCtx.roleOverview,
        allRoleBullets: roleCtx.allRoleBullets,
        bulletTools: roleCtx.bulletTools,
        availableRoleKeywords: roleCtx.availableRoleKeywords,
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
        if (
          !checkEcosystemCompatibility(
            slot.bullet.text,
            slot.bullet.tools,
            roleCtx.fullStack,
            keywordLabel
          )
        ) {
          continue;
        }
        const fitted = fitBulletToCalibratedLineArea(rawOption, cal);
        const effectiveMaxWordsCap =
          slot.charSlack < 25 ? Math.max(ctx.maxWordsCap, 14) : ctx.maxWordsCap;
        const guard = evaluateCandidateGuardrails(
          slot.bullet.text,
          fitted,
          bannedLower,
          cal,
          SINGLE_LINE_NCU,
          effectiveMaxWordsCap,
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

        const baseScore = 95;
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
          reason: `AI role-grounded rewrite weaving ${keywordLabel} into ${slot.containerTitle}`,
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
  const baseForbidden = buildForbiddenLabelsList(ctx);

  const compatibleTargets = targetKeywords.filter((kw) =>
    checkEcosystemCompatibility(
      container.existingBullets.join(" "),
      container.techSignals,
      container.techSignals,
      kw
    )
  );
  const primaryTarget = compatibleTargets[0] ?? targetKeywords[0] ?? container.techSignals[0] ?? "";
  if (
    primaryTarget &&
    !checkEcosystemCompatibility(
      container.existingBullets.join(" "),
      container.techSignals,
      container.techSignals,
      primaryTarget
    )
  ) {
    return [];
  }

  const forbidden = buildEcosystemForbiddenForBullet(
    container.existingBullets.join(" "),
    container.techSignals,
    container.techSignals,
    baseForbidden
  );

  const userPrompt = [
    `Role/project: ${container.roleSummary || container.title}`,
    `Stack used in this role: ${container.techSignals.join(", ") || "n/a"}`,
    `Domain: ${container.tags.join(", ") || "general"}`,
    `Key available compatible technologies for this role: ${compatibleTargets.join(", ") || primaryTarget}`,
    `Everything done in this role/project (all existing bullets):`,
    ...container.existingBullets.map((b, i) => `  ${i + 1}. ${b}`),
    `Forbidden (never mention): ${forbidden.join(", ") || "none"}`,
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

  const allowedBaselineMarkup = [
    container.existingBullets.join(" "),
    ...container.techSignals,
    ...compatibleTargets,
    ...targetKeywords,
  ].join(" ");
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

    // 4. Tech subset of {target} U stack (no banned_term or new_tech) and ecosystem-compatible
    const matchedTarget =
      compatibleTargets.find((kw) =>
        plain.toLowerCase().includes(kw.toLowerCase())
      ) ?? primaryTarget;
    if (
      !checkEcosystemCompatibility(
        container.existingBullets.join(" "),
        container.techSignals,
        container.techSignals,
        matchedTarget
      )
    ) {
      return;
    }
    const violations = validateRewrite(allowedBaselineMarkup, fitted, matchedTarget, ctx).filter(
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
