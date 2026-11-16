import { plainText } from "../utils";
import { applyLarpMutationsToResume } from "./apply";
import { classifyBulletContext } from "./candidates";
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
import type {
  CandidateBulletSlot,
  LarpAlignmentRun,
  MasterResume,
  PolicyMode,
  ViolationCode,
} from "./types";
import { buildKeywordDiagnostics, evaluateBelievabilityAndRecommend } from "./verify";

export interface LarpPipelineOptions {
  jdId?: string;
  variantOffset?: number;
  mode?: PolicyMode;
  llm?: Completer;
  llmModel?: string;
  includeLlmMalleable?: boolean;
  enableJudge?: boolean;
  excludePairs?: Set<string>;
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

  const tiers = classifyJobDescriptionTiers(jobDescription, resume);
  const weightedMap = extractWeightedJdKeywords(jobDescription);
  const keywordWeights = new Map<string, number>();
  for (const [k, v] of weightedMap.entries()) {
    keywordWeights.set(k, v.weight);
  }

  const { updatedCategories, changes: skillSwaps } = smartSwapSkillsSection(
    resume.skills,
    tiers,
    SINGLE_LINE_NCU
  );

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const twoLineMaxChars = cal.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;

  const slots = buildSlotsFromResume(resume, oneLineMaxChars, twoLineMaxChars);
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const centralizedTargetKeywords = getCentralizedTargetKeywords(
    tiers.tier_1_framing,
    tiers.tier_0_workflow
  );

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
    options.excludePairs
  );

  const malleableCount = cal.malleableLines ?? 1;
  const malleableBullets = synthesizeMalleableOneLineBullets(
    resume,
    tiers,
    malleableCount,
    variantOffset
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

  const tiers = classifyJobDescriptionTiers(jobDescription, resume);
  const weightedMap = extractWeightedJdKeywords(jobDescription);
  const keywordWeights = new Map<string, number>();
  for (const [k, v] of weightedMap.entries()) {
    keywordWeights.set(k, v.weight);
  }

  const { updatedCategories, changes: skillSwaps } = smartSwapSkillsSection(
    resume.skills,
    tiers,
    SINGLE_LINE_NCU
  );

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const twoLineMaxChars = cal.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;

  const slots = buildSlotsFromResume(resume, oneLineMaxChars, twoLineMaxChars);
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const centralizedTargetKeywords = getCentralizedTargetKeywords(
    tiers.tier_1_framing,
    tiers.tier_0_workflow
  );

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
    options.excludePairs
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
    variantOffset
  );

  if (options.includeLlmMalleable && malleableBullets.length > 0) {
    const containers = selectEligibleContainersForMalleableLines(resume).slice(
      0,
      malleableBullets.length
    );
    await Promise.all(
      malleableBullets.map(async (mb, idx) => {
        const container = containers[idx];
        if (!container) return;
        const llmOpts = await draftAndValidateLlmMalleableOptions({
          container,
          containerIdx: idx,
          targetKeywords: mb.injectedKeywords,
          tiers,
          cal,
          completer: options.llm!,
          guardCtx,
        });
        if (llmOpts.length > 0) {
          mb.options.unshift(...llmOpts);
          mb.markup = llmOpts[0].markup;
          mb.latex = llmOpts[0].latex;
          mb.chars = llmOpts[0].chars;
          mb.widthNcu = llmOpts[0].widthNcu;
          mb.fit = llmOpts[0].fit;
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
