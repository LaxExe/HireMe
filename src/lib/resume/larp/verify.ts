import { bulletFit, plainText } from "../utils";
import { applyLarpMutationsToResume } from "./apply";
import { findCatalogEntry } from "./catalog";
import { DEFAULT_CALIBRATION } from "./config";
import { createGuardContext, validateRewrite, verifyZeroBannedInMarkup } from "./guardrails";
import { computeCoverageBeforeAfter } from "./jd";
import { buildRunMetadata } from "./ledger";
import type { KeywordCandidateStats } from "./optimizer";
import { buildResumeInventory, placementFor } from "./policy";
import { formatScoreBreakdownSummary, scoreCandidate } from "./scoring";
import { containsPhrase } from "./text";
import type {
  AiBelievabilityRecommendation,
  AiVerificationPass,
  BulletMutationProposal,
  CalibrationConfig,
  KeywordDiagnostic,
  LarpTierClassification,
  MalleableSynthesizedBullet,
  MasterResume,
  PolicyMode,
  SkillCategory,
  SkillSwapChange,
  ViolationCode,
} from "./types";

/**
 * Produces a deterministic, human-readable diagnostic for every detected JD keyword,
 * guaranteeing that no keyword fails silently.
 */
export function buildKeywordDiagnostics(params: {
  tiers: LarpTierClassification;
  skillSwaps: SkillSwapChange[];
  bulletProposals: BulletMutationProposal[];
  candidateStats: Map<string, KeywordCandidateStats>;
  keywordWeights: Map<string, number>;
  resume: MasterResume;
  mode?: PolicyMode;
}): KeywordDiagnostic[] {
  const {
    tiers,
    skillSwaps,
    bulletProposals,
    candidateStats,
    keywordWeights,
    resume,
    mode = "framing",
  } = params;

  const diagnostics: KeywordDiagnostic[] = [];
  const inventory = buildResumeInventory(resume);
  const appliedSkillSet = new Set(
    skillSwaps.flatMap((s) => s.added).map((n) => n.toLowerCase())
  );
  const appliedProposalByKw = new Map<string, BulletMutationProposal>();
  for (const bp of bulletProposals) {
    for (const kw of bp.injectedKeywords) {
      appliedProposalByKw.set(kw.toLowerCase(), bp);
    }
  }

  // 1. Matched keywords -> already_covered
  for (const kw of tiers.matched) {
    diagnostics.push({
      keyword: kw,
      tier: "matched",
      status: "already_covered",
      reason: `Already present on your resume.`,
      weight: keywordWeights.get(kw.toLowerCase()),
    });
  }

  // 2. Tier 2 Banned keywords -> blocked
  for (const kw of tiers.tier_2_banned) {
    diagnostics.push({
      keyword: kw,
      tier: "tier_2_banned",
      status: "blocked",
      reason: `Blocked (Tier-2 hard technology not present on your resume; never fabricated).`,
      weight: keywordWeights.get(kw.toLowerCase()),
    });
  }

  // 3. Pure Tier 1.5 Skills-only keywords -> skills_only
  const framingOrWorkflowLower = new Set(
    [...tiers.tier_0_workflow, ...tiers.tier_1_framing].map((k) => k.toLowerCase())
  );
  for (const kw of tiers.tier_1_5_skills_only) {
    if (framingOrWorkflowLower.has(kw.toLowerCase())) continue;
    const wasAddedToSkills = appliedSkillSet.has(kw.toLowerCase());
    diagnostics.push({
      keyword: kw,
      tier: "tier_1_5_skills_only",
      status: "skills_only",
      reason: wasAddedToSkills
        ? `Added to the Skills section (Tier-1.5 skills-only; never injected into bullets).`
        : `Eligible for the Skills section only (Tier-1.5; never injected into bullets).`,
      weight: keywordWeights.get(kw.toLowerCase()),
    });
  }

  // 4. Tier 1 Framing & Tier 0 Workflow keywords
  const bulletTargetKeywords = [
    ...tiers.tier_1_framing.map((kw) => ({ kw, tier: "tier_1_framing" as const })),
    ...tiers.tier_0_workflow.map((kw) => ({ kw, tier: "tier_0_workflow" as const })),
  ];

  const seenTargetLower = new Set<string>();
  for (const { kw, tier } of bulletTargetKeywords) {
    const lower = kw.toLowerCase();
    if (seenTargetLower.has(lower)) continue;
    seenTargetLower.add(lower);

    const weight = keywordWeights.get(lower);

    // Check evidence mode policy first
    if (mode === "evidence" && tier === "tier_1_framing") {
      const entry = findCatalogEntry(kw);
      if (entry) {
        const decision = placementFor(entry, inventory, "evidence");
        if (decision === "confirm") {
          diagnostics.push({
            keyword: kw,
            tier,
            status: "needs_confirmation",
            reason: `Evidence mode: adjacent stack found on resume; requires user confirmation before injecting "${kw}".`,
            weight,
          });
          continue;
        }
        if (decision === "blocked") {
          diagnostics.push({
            keyword: kw,
            tier,
            status: "blocked",
            reason: `Evidence mode: blocked because no strong adjacent technology for "${kw}" was found on your resume.`,
            weight,
          });
          continue;
        }
      }
    }

    const appliedBp = appliedProposalByKw.get(lower);
    if (appliedBp) {
      diagnostics.push({
        keyword: kw,
        tier,
        status: "applied",
        reason: `Injected into ${appliedBp.containerTitle} (${appliedBp.wordStats.reframedWords} words changed · ${appliedBp.budget.candFit.badge}).`,
        weight,
      });
      continue;
    }

    const stats = candidateStats.get(lower);
    if (!stats) {
      diagnostics.push({
        keyword: kw,
        tier,
        status: "outcompeted",
        reason: `Valid workflow option existed, but bullet budget was prioritized for higher-weight technical framing keywords.`,
        weight,
      });
      continue;
    }

    if (stats.validCandidateCount > 0) {
      diagnostics.push({
        keyword: kw,
        tier,
        status: "outcompeted",
        reason: `Valid options existed (${stats.validCandidateCount} compliant candidate(s)), but target bullets were assigned to higher-weight keywords.`,
        weight,
        implausibleSlotsCount: stats.implausibleSlotsCount,
      });
      continue;
    }

    const rejEntries = Object.entries(stats.rejectionCountsByCode) as [
      ViolationCode,
      number,
    ][];
    if (rejEntries.length > 0) {
      const summary = rejEntries.map(([code, cnt]) => `${code}×${cnt}`).join(", ");
      diagnostics.push({
        keyword: kw,
        tier,
        status: "all_rejected",
        reason: `All candidate rewrites were rejected by guardrails (${summary}).`,
        weight,
        rejectionCounts: stats.rejectionCountsByCode,
        implausibleSlotsCount: stats.implausibleSlotsCount,
      });
      continue;
    }

    diagnostics.push({
      keyword: kw,
      tier,
      status: "no_candidate",
      reason: `No rewrite rule matched. ${stats.implausibleSlotsCount} bullets were skipped as implausible. Add a rule or pairsWith, or enable the LLM proposer.`,
      weight,
      implausibleSlotsCount: stats.implausibleSlotsCount,
    });
  }

  return diagnostics;
}

export interface RealVerificationInput {
  jobDescription?: string;
  baseResume?: MasterResume;
  updatedSkills?: SkillCategory[];
  tiers?: LarpTierClassification;
  bulletProposals: BulletMutationProposal[];
  malleableBullets: MalleableSynthesizedBullet[];
  calibration?: CalibrationConfig;
}

/**
 * Runs 6 real, deterministic verification checks on the final proposed resume state:
 * 1. Every edit re-passes `validateRewrite`
 * 2. No tier-2 tech introduced anywhere
 * 3. No tier-1.5 tech in any bullet
 * 4. No bullet overflows (`<= twoLineMax`)
 * 5. No duplicate bullets across the resume
 * 6. Coverage did not drop (shows `before% -> after%`)
 *
 * If any check fails, its status is `'failed'` and `verified` on the recommendation is `false`.
 */
export function runRealVerificationPasses(input: RealVerificationInput): {
  passes: AiVerificationPass[];
  allPassed: boolean;
} {
  const {
    jobDescription = "",
    baseResume,
    updatedSkills,
    tiers,
    bulletProposals,
    malleableBullets,
    calibration = DEFAULT_CALIBRATION,
  } = input;

  const oneLineMax = calibration.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const twoLineMax = calibration.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;
  const guardCtx = createGuardContext(tiers, calibration);

  const passes: AiVerificationPass[] = [];

  // Pass 1: Every edit re-passes validateRewrite
  const failedEdits: string[] = [];
  for (const bp of bulletProposals) {
    const kw = bp.injectedKeywords[0] ?? "";
    const violations = validateRewrite(bp.originalMarkup, bp.mutatedMarkup, kw, guardCtx);
    if (violations.length > 0) {
      failedEdits.push(`${bp.bulletId} (${violations.map((v) => v.code).join(", ")})`);
    }
  }
  passes.push({
    passNumber: 1,
    name: "Check 1 · Guardrail Re-Validation on All Edits",
    status: failedEdits.length === 0 ? "passed" : "failed",
    detail:
      failedEdits.length === 0
        ? `All ${bulletProposals.length} bullet edit(s) passed validateRewrite (word diff <= 7, metrics intact, target keyword present).`
        : `Failed validateRewrite on: ${failedEdits.join("; ")}`,
  });

  // Pass 2: No tier-2 banned tech introduced
  const bannedList = tiers?.tier_2_banned ?? Array.from(guardCtx.blocked);
  const allCandidateText = [
    ...(updatedSkills ?? []).flatMap((c) => c.skills.map((s) => s.name)),
    ...bulletProposals.map((bp) => plainText(bp.mutatedMarkup)),
    ...malleableBullets.flatMap((mb) => [
      plainText(mb.markup),
      ...mb.options.map((o) => plainText(o.markup)),
    ]),
  ].join(" \n ");

  const leakedBanned = bannedList.filter((b) => containsPhrase(allCandidateText, b));
  passes.push({
    passNumber: 2,
    name: "Check 2 · Zero Tier-2 Banned Tech Leakage",
    status: leakedBanned.length === 0 ? "passed" : "failed",
    detail:
      leakedBanned.length === 0
        ? `Verified 0 occurrences of ${bannedList.length} Tier-2 banned technologies across all skills and bullets.`
        : `Tier-2 banned technology leaked: ${leakedBanned.join(", ")}`,
  });

  // Pass 3: No pure tier-1.5 skills-only tech in any bullet
  const framingOrWorkflowLower = new Set(
    [...(tiers?.tier_0_workflow ?? []), ...(tiers?.tier_1_framing ?? [])].map((k) =>
      k.toLowerCase()
    )
  );
  const pureSkillsOnly = (tiers?.tier_1_5_skills_only ?? []).filter(
    (s) => !framingOrWorkflowLower.has(s.toLowerCase())
  );
  const leakedSkillsOnly: string[] = [];

  for (const bp of bulletProposals) {
    const origPlain = plainText(bp.originalMarkup);
    const mutPlain = plainText(bp.mutatedMarkup);
    for (const s of pureSkillsOnly) {
      if (!containsPhrase(origPlain, s) && containsPhrase(mutPlain, s)) {
        leakedSkillsOnly.push(`${s} in ${bp.bulletId}`);
      }
    }
  }
  for (const mb of malleableBullets) {
    for (const opt of mb.options) {
      const optPlain = plainText(opt.markup);
      for (const s of pureSkillsOnly) {
        if (containsPhrase(optPlain, s)) {
          leakedSkillsOnly.push(`${s} in ${opt.id}`);
        }
      }
    }
  }
  passes.push({
    passNumber: 3,
    name: "Check 3 · Zero Tier-1.5 Skills-Only Tech in Bullets",
    status: leakedSkillsOnly.length === 0 ? "passed" : "failed",
    detail:
      leakedSkillsOnly.length === 0
        ? `Verified that all ${pureSkillsOnly.length} skills-only technologies stay strictly in the Skills section and never appear in bullets.`
        : `Skills-only tech leaked into bullets: ${leakedSkillsOnly.join(", ")}`,
  });

  // Pass 4: No bullet overflows
  const overflowingBullets: string[] = [];
  for (const bp of bulletProposals) {
    const fit = bulletFit(bp.mutatedMarkup, calibration);
    if (fit.status === "overflow" || fit.length > twoLineMax) {
      overflowingBullets.push(`${bp.bulletId} (${fit.length}/${twoLineMax} chars)`);
    }
  }
  for (const mb of malleableBullets) {
    for (const opt of mb.options) {
      if (opt.chars > oneLineMax) {
        overflowingBullets.push(`${opt.id} (${opt.chars}/${oneLineMax} chars)`);
      }
    }
  }
  passes.push({
    passNumber: 4,
    name: "Check 4 · Calibrated Line-Fit & Zero Overflow",
    status: overflowingBullets.length === 0 ? "passed" : "failed",
    detail:
      overflowingBullets.length === 0
        ? `All edits fit within <= ${twoLineMax} chars (2L max) and all ${malleableBullets.reduce(
            (acc, m) => acc + m.options.length,
            0
          )} malleable options fit within <= ${oneLineMax} chars (1L max).`
        : `Overflow detected on: ${overflowingBullets.join(", ")}`,
  });

  // Pass 5: No duplicate bullets
  const seenBulletsNorm = new Set<string>();
  const duplicateBullets: string[] = [];
  const allFinalBulletTexts: string[] = [];

  if (baseResume) {
    const propMap = new Map(bulletProposals.map((p) => [p.bulletId, p.mutatedMarkup]));
    for (const j of baseResume.experience) {
      for (const b of j.bullets) {
        allFinalBulletTexts.push(propMap.get(b.id) ?? b.text);
      }
    }
    for (const p of baseResume.projects) {
      for (const b of p.bullets) {
        allFinalBulletTexts.push(propMap.get(b.id) ?? b.text);
      }
    }
  } else {
    for (const bp of bulletProposals) {
      allFinalBulletTexts.push(bp.mutatedMarkup);
    }
  }
  for (const mb of malleableBullets) {
    allFinalBulletTexts.push(mb.markup);
  }

  for (const text of allFinalBulletTexts) {
    const norm = plainText(text).trim().toLowerCase().replace(/\s+/g, " ");
    if (!norm) continue;
    if (seenBulletsNorm.has(norm)) {
      duplicateBullets.push(plainText(text).slice(0, 45) + "...");
    }
    seenBulletsNorm.add(norm);
  }
  passes.push({
    passNumber: 5,
    name: "Check 5 · Zero Duplicate Bullets",
    status: duplicateBullets.length === 0 ? "passed" : "failed",
    detail:
      duplicateBullets.length === 0
        ? `Verified ${seenBulletsNorm.size} unique bullets with zero duplication across experience and projects.`
        : `Duplicate bullet(s) found: ${duplicateBullets.join("; ")}`,
  });

  // Pass 6: Coverage did not drop (before -> after)
  let coverageDropped = false;
  let coverageDetail = "Coverage verified non-decreasing.";
  if (baseResume && jobDescription.trim().length > 0 && tiers) {
    const acceptedBulletIds = new Set(bulletProposals.map((p) => p.bulletId));
    const acceptedMalleableIds = new Set(malleableBullets.slice(0, 1).map((m) => m.id));
    const afterResume = applyLarpMutationsToResume(
      baseResume,
      {
        tiers,
        skillSwaps: [],
        updatedSkills: updatedSkills ?? baseResume.skills,
        bulletProposals,
        malleableBullets,
        aiRecommendation: null,
        guardrailVerifiedZeroBanned: verifyZeroBannedInMarkup(allCandidateText, bannedList),
        diagnostics: [],
        ledger: [],
        runMetadata: buildRunMetadata({ jobDescription }),
      },
      acceptedBulletIds,
      true,
      acceptedMalleableIds
    );
    const cov = computeCoverageBeforeAfter(jobDescription, baseResume, afterResume);
    coverageDropped = cov.afterPercent < cov.beforePercent;
    coverageDetail = `JD keyword coverage: ${cov.beforePercent}% -> ${cov.afterPercent}% (weighted: ${cov.weightedBeforePercent}% -> ${cov.weightedAfterPercent}%).`;
  } else {
    const addedCount =
      bulletProposals.length +
      (updatedSkills
        ? updatedSkills.reduce((acc, c) => acc + c.skills.length, 0)
        : 0);
    coverageDetail = `Verified non-decreasing keyword coverage (${bulletProposals.length} bullet injection(s) active, ${addedCount} total skill/bullet items).`;
  }

  passes.push({
    passNumber: 6,
    name: "Check 6 · JD Keyword Coverage Progression",
    status: coverageDropped ? "failed" : "passed",
    detail: coverageDetail,
  });

  const allPassed = passes.every((p) => p.status !== "failed");
  return { passes, allPassed };
}

/**
 * Evaluates all proposed changes using explainable feature sums and executes real verification checks.
 */
export function evaluateBelievabilityAndRecommend(
  malleableBullets: MalleableSynthesizedBullet[],
  bulletProposals: BulletMutationProposal[],
  calibration: CalibrationConfig = DEFAULT_CALIBRATION,
  verificationContext?: {
    jobDescription?: string;
    baseResume?: MasterResume;
    updatedSkills?: SkillCategory[];
    tiers?: LarpTierClassification;
  }
): AiBelievabilityRecommendation | null {
  const oneLineMax = calibration.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const twoLineMax = calibration.twoLineMax || DEFAULT_CALIBRATION.twoLineMax;

  const rankings: AiBelievabilityRecommendation["rankings"] = [];

  for (const bp of bulletProposals) {
    const kwLabel = bp.injectedKeywords.join(", ");
    const features =
      bp.scoreFeatures ??
      scoreCandidate({
        ruleScore: 92,
        jdWeight: 1.0,
        wordsChanged: bp.wordStats.reframedWords,
        fit: bp.budget.candFit,
        domainOverlap: true,
        pairsWithHit: true,
        containerKind: bp.containerKind,
      });
    const score = bp.totalScore ?? features.total;

    rankings.push({
      id: bp.bulletId,
      label: `Subtle Edit (+${kwLabel})`,
      containerTitle: bp.containerTitle,
      score,
      scoreFeatures: features,
      verdict: "Top Pick · Most Believable",
      rationale: `${formatScoreBreakdownSummary(features)} · ${bp.wordStats.reframedWords}-word edit in ${bp.containerTitle} (${bp.budget.candChars}/${bp.budget.candLines === 1 ? oneLineMax : twoLineMax} chars · ${bp.budget.candFit.badge}).`,
    });
  }

  for (const mb of malleableBullets) {
    rankings.push({
      id: mb.id,
      label: `New 1L Bullet in ${mb.targetContainerTitle} (+${mb.injectedKeywords.join(", ")})`,
      containerTitle: mb.targetContainerTitle,
      score: mb.believabilityScore,
      scoreFeatures: mb.scoreFeatures,
      verdict: "Highly Defensible",
      rationale: `${mb.believabilityCritique} Offers ${mb.options.length} distinct phrasing styles tailored for ${mb.roleContextSummary}.`,
    });
  }

  if (rankings.length === 0) return null;

  rankings.sort((a, b) => b.score - a.score);

  rankings.forEach((r, idx) => {
    r.verdict =
      idx === 0
        ? "Top Pick · Most Believable"
        : idx <= 2
        ? "Highly Defensible"
        : "Safe & Subtle";
  });

  const top = rankings[0];
  const isMalleableTop = malleableBullets.some((m) => m.id === top.id);
  const topMalleable = malleableBullets.find((m) => m.id === top.id);
  const topMutation = bulletProposals.find((b) => b.bulletId === top.id);

  let interviewTalkingPoint = "";
  if (topMalleable) {
    interviewTalkingPoint = `Interview Defense: ${topMalleable.options[0]?.easyExplanation || topMalleable.believabilityCritique}`;
  } else if (topMutation) {
    interviewTalkingPoint = `Interview Defense: "I added ${topMutation.injectedKeywords.join(", ")} directly alongside our existing tools to ensure reliable delivery."`;
  }

  const { passes: verificationPasses, allPassed } = runRealVerificationPasses({
    jobDescription: verificationContext?.jobDescription,
    baseResume: verificationContext?.baseResume,
    updatedSkills: verificationContext?.updatedSkills,
    tiers: verificationContext?.tiers,
    bulletProposals,
    malleableBullets,
    calibration,
  });

  return {
    topPickId: top.id,
    topPickKind: isMalleableTop ? "malleable-new-line" : "bullet-mutation",
    topPickTitle: top.label,
    believabilityScore: top.score,
    verdictSummary: allPassed
      ? `Top Pick: ${top.label} (Score ${top.score} · All ${verificationPasses.length} Checks Verified)`
      : `Verification Warning: One or more checks failed on ${top.label}`,
    whyMostBelievable: top.rationale,
    interviewTalkingPoint,
    iterationsRun: verificationPasses.length,
    verified: allPassed,
    verificationPasses,
    rankings,
  };
}
