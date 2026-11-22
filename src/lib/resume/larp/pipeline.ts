import { matchJobDescriptionWithResume, type KeywordMatchItem } from "../keywordMatch";
import { plainText, splitItems } from "../utils";
import { applyLarpMutationsToResume } from "./apply";
import { classifyBulletContext } from "./candidates";
import { findCatalogEntry } from "./catalog";
import { DEFAULT_CALIBRATION, inferDomainTags, SINGLE_LINE_NCU } from "./config";
import { createGuardContext, verifyRunGuardrailZeroBanned } from "./guardrails";
import {
  classifyJobDescriptionTiers,
  computeCoverageBeforeAfter,
  extractWeightedJdKeywords,
} from "./jd";
import { buildRunLedger, buildRunMetadata } from "./ledger";
import {
  draftAndValidateLlmMalleableOptions,
  PROMPT_VERSION,
  proposeAndValidateLlmBulletCandidates,
  type Completer,
  type LlmTelemetry,
} from "./llm";
import {
  selectEligibleContainersForMalleableLines,
  synthesizeMalleableOneLineBullets,
} from "./malleable";
import { selectBulletMutations, type KeywordCandidateStats } from "./optimizer";
import { getCentralizedTargetKeywords } from "./policy";
import { smartSwapSkillsSection } from "./skills";
import { containsPhrase } from "./text";
import type {
  CandidateBulletSlot,
  LarpAlignmentRun,
  LarpTierClassification,
  MasterResume,
  PolicyMode,
  ViolationCode,
} from "./types";
import { buildKeywordDiagnostics, evaluateBelievabilityAndRecommend } from "./verify";

export const FOCUSED_ALIGNMENT_PROMPT_VERSION = "align-v2.3-focused-missing-tech";

export interface LarpPipelineOptions {
  jdId?: string;
  variantOffset?: number;
  mode?: PolicyMode;
  llm?: Completer;
  llmModel?: string;
  includeLlmMalleable?: boolean;
  enableJudge?: boolean;
  excludePairs?: Set<string>;
  focusedRecommendations?: boolean;
  defaultPicksByCompanyKey?: Record<string, string>;
}

function buildSlotsFromResume(
  resume: MasterResume,
  oneLineMaxChars: number,
  twoLineMaxChars: number
): CandidateBulletSlot[] {
  const slots: CandidateBulletSlot[] = [];

  resume.experience.forEach((job, jobIdx) => {
    const jobStack = job.bullets.flatMap((b) => b.tools);
    const containerTags =
      job.tags && job.tags.length > 0
        ? job.tags
        : inferDomainTags(`${job.title} ${job.company}`, jobStack);

    for (const bullet of job.bullets) {
      const origPlainLen = plainText(bullet.text).trim().length;
      if (origPlainLen === 0) continue;
      const origLines = origPlainLen <= oneLineMaxChars ? 1 : 2;
      const maxAllowedChars = origLines === 1 ? oneLineMaxChars : twoLineMaxChars;
      const charSlack = maxAllowedChars - origPlainLen;
      const bulletTags = Array.from(
        new Set([
          ...containerTags,
          ...inferDomainTags(`${job.title} ${job.company} ${plainText(bullet.text)}`, bullet.tools),
        ])
      );
      const context = classifyBulletContext(
        bullet.text,
        `${job.title} ${job.company}`,
        job.tags
      );
      const defensibilityBonus = jobIdx > 0 ? 5 : 0;

      slots.push({
        bullet,
        containerId: job.id,
        containerTitle: `${job.title} · ${job.company}`,
        containerKind: "experience",
        containerStack: jobStack,
        context,
        tags: bulletTags,
        defensibilityBonus,
        origPlainLen,
        maxAllowedChars,
        charSlack,
      });
    }
  });

  for (const proj of resume.projects) {
    const containerTags =
      proj.tags && proj.tags.length > 0
        ? proj.tags
        : inferDomainTags(proj.name, proj.techStack);

    for (const bullet of proj.bullets) {
      const origPlainLen = plainText(bullet.text).trim().length;
      if (origPlainLen === 0) continue;
      const origLines = origPlainLen <= oneLineMaxChars ? 1 : 2;
      const maxAllowedChars = origLines === 1 ? oneLineMaxChars : twoLineMaxChars;
      const charSlack = maxAllowedChars - origPlainLen;
      const bulletTags = Array.from(
        new Set([
          ...containerTags,
          ...inferDomainTags(
            `${proj.name} ${proj.techStack.join(" ")} ${plainText(bullet.text)}`,
            bullet.tools
          ),
        ])
      );
      const context = classifyBulletContext(
        bullet.text,
        `${proj.name} ${proj.techStack.join(" ")}`,
        proj.tags
      );

      slots.push({
        bullet,
        containerId: proj.id,
        containerTitle: proj.name,
        containerKind: "project",
        containerStack: proj.techStack,
        context,
        tags: bulletTags,
        defensibilityBonus: 6,
        origPlainLen,
        maxAllowedChars,
        charSlack,
      });
    }
  }

  return slots;
}

const HARD_BANNED_LANGUAGES = new Set([
  "golang",
  "go",
  "rust",
  "java",
  "c#",
  "kotlin",
  "swift",
  "scala",
  "ruby",
  "php",
  "r",
  "matlab",
  "dart",
  "cuda",
  "verilog",
  "assembly",
  "elixir",
  "python",
  "c++",
]);

const HARD_BANNED_HEAVY_FRAMEWORKS = new Set([
  "kubernetes",
  "ruby on rails",
  "spring boot",
  ".net",
  "angular",
  "vue.js",
  "svelte",
  "flutter",
  "react native",
  "react",
  "pytorch",
]);

const WORKFLOW_KEYWORDS_LOWER = new Set([
  "agile",
  "jira",
  "linear",
  "ci/cd",
  "end-to-end",
]);

const NO_SKILLS_SECTION_KEYWORDS_LOWER = new Set([
  "agile",
  "end-to-end",
  "unit testing",
]);

function isHardBannedMissingTech(
  item: KeywordMatchItem | string,
  presentLower: Set<string>
): boolean {
  const rawName = typeof item === "string" ? item : item.name;
  const entry = findCatalogEntry(rawName);
  const labelLower = (entry?.label ?? rawName).toLowerCase();

  if (presentLower.has(labelLower) || presentLower.has(rawName.toLowerCase())) {
    return false;
  }

  if (labelLower === "c") {
    return !(presentLower.has("c++") || presentLower.has("c"));
  }
  if (
    labelLower === "javascript" ||
    labelLower === "html" ||
    labelLower === "css" ||
    labelLower === "typescript"
  ) {
    return !(
      presentLower.has("typescript") ||
      presentLower.has("javascript") ||
      presentLower.has("react") ||
      presentLower.has("next.js") ||
      presentLower.has("html") ||
      presentLower.has("css")
    );
  }
  if (labelLower === "bash") {
    return !(
      presentLower.has("linux") ||
      presentLower.has("unix") ||
      presentLower.has("python") ||
      presentLower.has("c++") ||
      presentLower.has("docker") ||
      presentLower.has("git")
    );
  }
  if (labelLower === "sql" || labelLower === "nosql") {
    return !(
      presentLower.has("sql") ||
      presentLower.has("postgresql") ||
      presentLower.has("sqlite") ||
      presentLower.has("sqlite3") ||
      presentLower.has("mysql") ||
      presentLower.has("supabase") ||
      presentLower.has("firebase") ||
      presentLower.has("mongodb")
    );
  }

  if (HARD_BANNED_LANGUAGES.has(labelLower)) return true;
  if (HARD_BANNED_HEAVY_FRAMEWORKS.has(labelLower)) return true;
  if (entry?.tier === "tier_2_banned") return true;
  return false;
}

function buildFocusedTiersAndTargets(
  jobDescription: string,
  resume: MasterResume,
  baseTiers: LarpTierClassification,
  keywordWeights: Map<string, number>
): { tiers: LarpTierClassification; bulletTargets: string[] } {
  const matchRes = matchJobDescriptionWithResume(jobDescription, resume);

  // Merge exact TECH_DICTIONARY section/title weights into keywordWeights
  for (const item of [...matchRes.matched, ...matchRes.missing]) {
    if (item.weight === undefined) continue;
    const lower = item.name.toLowerCase();
    const catalogLabel = findCatalogEntry(item.name)?.label.toLowerCase();
    if (!keywordWeights.has(lower)) keywordWeights.set(lower, item.weight);
    if (catalogLabel && !keywordWeights.has(catalogLabel)) {
      keywordWeights.set(catalogLabel, item.weight);
    }
  }

  const presentLower = new Set<string>();
  for (const m of matchRes.matched) presentLower.add(m.name.toLowerCase());
  for (const cat of resume.skills) {
    for (const s of cat.skills) {
      presentLower.add(s.name.toLowerCase());
      for (const part of splitItems(s.name)) {
        presentLower.add(part.trim().toLowerCase());
      }
    }
  }
  for (const job of resume.experience) {
    for (const b of job.bullets) {
      for (const t of b.tools) presentLower.add(t.toLowerCase());
    }
  }
  for (const proj of resume.projects) {
    for (const t of proj.techStack) presentLower.add(t.toLowerCase());
    for (const b of proj.bullets) {
      for (const t of b.tools) presentLower.add(t.toLowerCase());
    }
  }

  const missingNamesLower = new Set(matchRes.missing.map((m) => m.name.toLowerCase()));
  const matchedList: string[] = [];
  const matchedSeen = new Set<string>();

  for (const m of matchRes.matched) {
    const label = findCatalogEntry(m.name)?.label ?? m.name;
    const key = label.toLowerCase();
    if (!matchedSeen.has(key)) {
      matchedSeen.add(key);
      matchedList.push(label);
    }
  }
  for (const mName of baseTiers.matched) {
    const label = findCatalogEntry(mName)?.label ?? mName;
    const key = label.toLowerCase();
    if (!missingNamesLower.has(key) && !missingNamesLower.has(mName.toLowerCase()) && !matchedSeen.has(key)) {
      matchedSeen.add(key);
      matchedList.push(label);
    }
  }

  const tier0List: string[] = [];
  const tier1List: string[] = [];
  const tier15List: string[] = [];
  const tier2List: string[] = [];
  const seenMissing = new Set<string>();

  const classifyMissingCandidate = (rawItem: KeywordMatchItem | string) => {
    const rawName = typeof rawItem === "string" ? rawItem : rawItem.name;
    const entry = findCatalogEntry(rawName);
    const label = entry?.label ?? rawName;
    const key = label.toLowerCase();
    if (seenMissing.has(key) || matchedSeen.has(key)) return;
    seenMissing.add(key);

    if (isHardBannedMissingTech(rawItem, presentLower)) {
      tier2List.push(label);
      return;
    }

    if (WORKFLOW_KEYWORDS_LOWER.has(key) || WORKFLOW_KEYWORDS_LOWER.has(rawName.toLowerCase())) {
      tier0List.push(label);
    } else {
      tier1List.push(label);
    }

    if (!NO_SKILLS_SECTION_KEYWORDS_LOWER.has(key)) {
      tier15List.push(label);
    }
  };

  const sortedMissing = [...matchRes.missing].sort(
    (a, b) => (b.weight ?? 0.7) - (a.weight ?? 0.7)
  );
  for (const item of sortedMissing) {
    classifyMissingCandidate(item);
  }
  for (const k of [
    ...baseTiers.tier_1_framing,
    ...baseTiers.tier_0_workflow,
    ...baseTiers.tier_1_5_skills_only,
    ...baseTiers.tier_2_banned,
  ]) {
    classifyMissingCandidate(k);
  }

  // Count how many Experience bullet texts actually mention each matched JD keyword
  const expBullets = resume.experience.flatMap((j) => j.bullets);
  const countExpBulletMentions = (itemName: string): number => {
    const entry = findCatalogEntry(itemName);
    const terms = Array.from(new Set([itemName, ...(entry?.aliases ?? [])]));
    let hits = 0;
    for (const b of expBullets) {
      const plain = plainText(b.text);
      const matchedInBullet = terms.some((t) =>
        t.length >= 2
          ? containsPhrase(plain, t)
          : new RegExp(`(?<![A-Za-z0-9+#.])${t}(?![A-Za-z0-9+#])`).test(plain)
      );
      if (matchedInBullet) hits++;
    }
    return hits;
  };

  const sortedMatched = [...matchRes.matched].sort(
    (a, b) => (b.weight ?? 0.7) - (a.weight ?? 0.7)
  );
  const zeroExpMatched: string[] = [];
  const lowExpMatched: string[] = [];
  const addedTargetKeys = new Set<string>();

  for (const item of sortedMatched) {
    const label = findCatalogEntry(item.name)?.label ?? item.name;
    const key = label.toLowerCase();
    const expMentions = item.foundIn.includes("experience")
      ? countExpBulletMentions(item.name)
      : 0;
    if (expMentions === 0) {
      zeroExpMatched.push(label);
    } else if (expMentions <= 1) {
      lowExpMatched.push(label);
    }
  }

  const bulletTargets: string[] = [];
  const pushTarget = (kw: string) => {
    const key = kw.toLowerCase();
    if (addedTargetKeys.has(key)) return;
    addedTargetKeys.add(key);
    bulletTargets.push(kw);
  };

  for (const kw of tier1List) pushTarget(kw);
  for (const kw of zeroExpMatched) pushTarget(kw);
  for (const kw of tier0List) pushTarget(kw);
  if (bulletTargets.length < 3) {
    for (const kw of lowExpMatched) pushTarget(kw);
  }

  return {
    tiers: {
      matched: matchedList,
      tier_0_workflow: tier0List,
      tier_1_framing: tier1List,
      tier_1_5_skills_only: tier15List,
      tier_2_banned: tier2List,
    },
    bulletTargets,
  };
}

export function runLarpAlignmentPipeline(
  jobDescription: string,
  resume: MasterResume,
  variantOffsetOrOptions: number | LarpPipelineOptions = 0
): LarpAlignmentRun {
  const options: LarpPipelineOptions =
    typeof variantOffsetOrOptions === "number"
      ? { variantOffset: variantOffsetOrOptions }
      : variantOffsetOrOptions;
  const variantOffset = options.variantOffset ?? 0;

  const baseTiers = classifyJobDescriptionTiers(jobDescription, resume);
  const weightedMap = extractWeightedJdKeywords(jobDescription);
  const keywordWeights = new Map<string, number>();
  for (const [k, v] of weightedMap.entries()) {
    keywordWeights.set(k, v.weight);
  }

  const focusedResolved = options.focusedRecommendations
    ? buildFocusedTiersAndTargets(jobDescription, resume, baseTiers, keywordWeights)
    : null;
  const tiers = focusedResolved ? focusedResolved.tiers : baseTiers;

  const { updatedCategories, changes: skillSwaps } = smartSwapSkillsSection(
    resume.skills,
    tiers,
    SINGLE_LINE_NCU,
    Boolean(options.focusedRecommendations)
  );

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const twoLineMaxChars = cal.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;

  const slots = buildSlotsFromResume(resume, oneLineMaxChars, twoLineMaxChars);
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const centralizedTargetKeywords = focusedResolved
    ? focusedResolved.bulletTargets
    : getCentralizedTargetKeywords(tiers.tier_1_framing, tiers.tier_0_workflow);

  const statsOut = new Map<string, KeywordCandidateStats>();
  const bulletProposals = selectBulletMutations(
    slots,
    centralizedTargetKeywords,
    bannedLower,
    cal,
    variantOffset,
    SINGLE_LINE_NCU,
    tiers,
    undefined,
    statsOut,
    undefined,
    keywordWeights,
    options.excludePairs,
    Boolean(options.focusedRecommendations)
  );

  const malleableCount = cal.malleableLines ?? 1;
  const malleableBullets = synthesizeMalleableOneLineBullets(
    resume,
    tiers,
    malleableCount,
    variantOffset,
    options.focusedRecommendations
      ? {
          focusedRecommendations: true,
          jobDescription,
          keywordWeights,
          defaultPicksByCompanyKey: options.defaultPicksByCompanyKey,
          extraBulletTargets: focusedResolved?.bulletTargets,
        }
      : undefined
  );
  const aiRecommendation = evaluateBelievabilityAndRecommend(
    malleableBullets,
    bulletProposals,
    cal,
    {
      jobDescription,
      baseResume: resume,
      updatedSkills: updatedCategories,
      tiers,
    }
  );

  const guardrailVerifiedZeroBanned = verifyRunGuardrailZeroBanned(
    updatedCategories,
    bulletProposals,
    malleableBullets,
    bannedLower
  );

  const diagnostics = buildKeywordDiagnostics({
    tiers,
    skillSwaps,
    bulletProposals,
    candidateStats: statsOut,
    keywordWeights,
    resume,
    mode: options.mode ?? "framing",
  });

  const ledger = buildRunLedger({
    tiers,
    skillSwaps,
    bulletProposals,
    malleableBullets,
  });

  const runMetadata = buildRunMetadata({
    jdId: options.jdId,
    jobDescription,
    mode: options.mode ?? "framing",
    model: options.llmModel ?? "deterministic-rules",
    promptVersion: options.focusedRecommendations
      ? FOCUSED_ALIGNMENT_PROMPT_VERSION
      : PROMPT_VERSION,
  });

  const acceptedBulletIds = new Set(bulletProposals.map((p) => p.bulletId));
  const acceptedMalleableIds = new Set(malleableBullets.slice(0, 1).map((m) => m.id));
  const afterResume = applyLarpMutationsToResume(
    resume,
    {
      tiers,
      skillSwaps,
      updatedSkills: updatedCategories,
      bulletProposals,
      malleableBullets,
      aiRecommendation,
      guardrailVerifiedZeroBanned,
      diagnostics,
      ledger,
      runMetadata,
    },
    acceptedBulletIds,
    true,
    acceptedMalleableIds
  );
  const coverage = computeCoverageBeforeAfter(jobDescription, resume, afterResume);

  return {
    tiers,
    skillSwaps,
    updatedSkills: updatedCategories,
    bulletProposals,
    malleableBullets,
    aiRecommendation,
    guardrailVerifiedZeroBanned,
    diagnostics,
    ledger,
    runMetadata,
    coverage,
  };
}

/**
 * Async pipeline entry point that supports an optional `Options.llm` (`Completer`)
 * while enforcing the exact same deterministic guardrails and fallback rules.
 */
export async function runLarpAlignmentPipelineAsync(
  jobDescription: string,
  resume: MasterResume,
  options: LarpPipelineOptions = {}
): Promise<LarpAlignmentRun & { llmTelemetry?: LlmTelemetry }> {
  const variantOffset = options.variantOffset ?? 0;
  if (!options.llm) {
    return runLarpAlignmentPipeline(jobDescription, resume, options);
  }

  const baseTiers = classifyJobDescriptionTiers(jobDescription, resume);
  const weightedMap = extractWeightedJdKeywords(jobDescription);
  const keywordWeights = new Map<string, number>();
  for (const [k, v] of weightedMap.entries()) {
    keywordWeights.set(k, v.weight);
  }

  const focusedResolved = options.focusedRecommendations
    ? buildFocusedTiersAndTargets(jobDescription, resume, baseTiers, keywordWeights)
    : null;
  const tiers = focusedResolved ? focusedResolved.tiers : baseTiers;

  const { updatedCategories, changes: skillSwaps } = smartSwapSkillsSection(
    resume.skills,
    tiers,
    SINGLE_LINE_NCU,
    Boolean(options.focusedRecommendations)
  );

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const twoLineMaxChars = cal.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;

  const slots = buildSlotsFromResume(resume, oneLineMaxChars, twoLineMaxChars);
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const centralizedTargetKeywords = focusedResolved
    ? focusedResolved.bulletTargets
    : getCentralizedTargetKeywords(tiers.tier_1_framing, tiers.tier_0_workflow);

  const guardCtx = createGuardContext(tiers, cal, undefined, 7, SINGLE_LINE_NCU);
  const rejectionCountsByKeyword = new Map<string, Partial<Record<ViolationCode, number>>>();

  const { candidates: llmCandidates, telemetry: llmTelemetry } =
    await proposeAndValidateLlmBulletCandidates({
      slots,
      keywords: centralizedTargetKeywords,
      tiers,
      cal,
      completer: options.llm,
      resume,
      model: options.llmModel,
      enableJudge: options.enableJudge,
      guardCtx,
      rejectionCountsByKeyword,
    });

  const statsOut = new Map<string, KeywordCandidateStats>();
  const bulletProposals = selectBulletMutations(
    slots,
    centralizedTargetKeywords,
    bannedLower,
    cal,
    variantOffset,
    SINGLE_LINE_NCU,
    tiers,
    guardCtx,
    statsOut,
    llmCandidates,
    keywordWeights,
    options.excludePairs,
    Boolean(options.focusedRecommendations)
  );

  // Merge LLM rejection counts into statsOut so all_rejected diagnostics include LLM rejections
  for (const [kwLower, llmRejs] of rejectionCountsByKeyword.entries()) {
    const existing = statsOut.get(kwLower);
    if (existing) {
      for (const [code, cnt] of Object.entries(llmRejs) as [ViolationCode, number][]) {
        existing.rejectionCountsByCode[code] =
          (existing.rejectionCountsByCode[code] ?? 0) + (cnt ?? 0);
      }
    }
  }

  const malleableCount = cal.malleableLines ?? 1;
  const malleableBullets = synthesizeMalleableOneLineBullets(
    resume,
    tiers,
    malleableCount,
    variantOffset,
    options.focusedRecommendations
      ? {
          focusedRecommendations: true,
          jobDescription,
          keywordWeights,
          defaultPicksByCompanyKey: options.defaultPicksByCompanyKey,
          extraBulletTargets: focusedResolved?.bulletTargets,
        }
      : undefined
  );

  if (options.includeLlmMalleable && malleableBullets.length > 0) {
    const allContainers = selectEligibleContainersForMalleableLines(resume);
    await Promise.all(
      malleableBullets.map(async (mb, mbIdx) => {
        const container =
          allContainers.find((c) => c.id === mb.targetContainerId) ?? allContainers[mbIdx] ?? allContainers[0];
        if (!container) return;

        const targetPool = Array.from(
          new Set([...mb.injectedKeywords, ...centralizedTargetKeywords])
        );
        const llmOpts = await draftAndValidateLlmMalleableOptions({
          container,
          containerIdx: mbIdx,
          targetKeywords: targetPool,
          tiers,
          cal,
          completer: options.llm!,
          guardCtx,
        });
        if (llmOpts.length > 0) {
          if (options.focusedRecommendations) {
            const styledLlm = llmOpts.slice(0, 2).map((o, idx) => ({
              ...o,
              id: `${mb.id}-llm-${idx + 1}`,
              styleLabel: "JD Match" as const,
            }));
            const templateJdOpts = mb.options.filter(
              (o) => !o.isDefaultPick && o.source !== "default"
            );
            const defaultOpts = mb.options.filter(
              (o) => o.isDefaultPick || o.source === "default"
            );
            const mergedJdOpts = [...styledLlm, ...templateJdOpts].slice(0, 2);
            mb.options = [...mergedJdOpts, ...defaultOpts];
            mb.markup = mergedJdOpts[0]?.markup ?? mb.markup;
            mb.latex = mergedJdOpts[0]?.latex ?? mb.latex;
            mb.chars = mergedJdOpts[0]?.chars ?? mb.chars;
            mb.widthNcu = mergedJdOpts[0]?.widthNcu ?? mb.widthNcu;
            mb.fit = mergedJdOpts[0]?.fit ?? mb.fit;
          } else {
            mb.options.unshift(...llmOpts);
            mb.markup = llmOpts[0].markup;
            mb.latex = llmOpts[0].latex;
            mb.chars = llmOpts[0].chars;
            mb.widthNcu = llmOpts[0].widthNcu;
            mb.fit = llmOpts[0].fit;
          }
        }
      })
    );
  }

  const aiRecommendation = evaluateBelievabilityAndRecommend(
    malleableBullets,
    bulletProposals,
    cal,
    {
      jobDescription,
      baseResume: resume,
      updatedSkills: updatedCategories,
      tiers,
    }
  );

  const guardrailVerifiedZeroBanned = verifyRunGuardrailZeroBanned(
    updatedCategories,
    bulletProposals,
    malleableBullets,
    bannedLower
  );

  const diagnostics = buildKeywordDiagnostics({
    tiers,
    skillSwaps,
    bulletProposals,
    candidateStats: statsOut,
    keywordWeights,
    resume,
    mode: options.mode ?? "framing",
  });

  const ledger = buildRunLedger({
    tiers,
    skillSwaps,
    bulletProposals,
    malleableBullets,
  });

  const runMetadata = buildRunMetadata({
    jdId: options.jdId,
    jobDescription,
    mode: options.mode ?? "framing",
    model: options.llmModel ?? llmTelemetry.model,
    promptVersion: options.focusedRecommendations
      ? FOCUSED_ALIGNMENT_PROMPT_VERSION
      : PROMPT_VERSION,
  });

  const acceptedBulletIds = new Set(bulletProposals.map((p) => p.bulletId));
  const acceptedMalleableIds = new Set(malleableBullets.slice(0, 1).map((m) => m.id));
  const afterResume = applyLarpMutationsToResume(
    resume,
    {
      tiers,
      skillSwaps,
      updatedSkills: updatedCategories,
      bulletProposals,
      malleableBullets,
      aiRecommendation,
      guardrailVerifiedZeroBanned,
      diagnostics,
      ledger,
      runMetadata,
    },
    acceptedBulletIds,
    true,
    acceptedMalleableIds
  );
  const coverage = computeCoverageBeforeAfter(jobDescription, resume, afterResume);

  return {
    tiers,
    skillSwaps,
    updatedSkills: updatedCategories,
    bulletProposals,
    malleableBullets,
    aiRecommendation,
    guardrailVerifiedZeroBanned,
    diagnostics,
    ledger,
    runMetadata,
    coverage,
    llmTelemetry,
  };
}
