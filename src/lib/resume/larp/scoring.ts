import type { BulletFitResult, ContainerCandidate } from "./types";

/**
 * Dynamically computes an authentic, multi-dimensional AI Believability Score (88% - 98%)
 * based on domain proximity, existing stack overlap, claim modesty, and line-fit margin.
 */
export function calculateDynamicBelievabilityScore(params: {
  proposedKeywords: string[];
  containerKind: "experience" | "project";
  containerTitle: string;
  domain: ContainerCandidate["domain"];
  existingTechSignals: string[];
  existingBulletsText: string;
  actionStyle: string;
  lineBudgetFit?: BulletFitResult;
  isSubtleEdit?: boolean;
}): { score: number; critique: string; interviewDefense: string } {
  const {
    proposedKeywords,
    containerTitle,
    domain,
    existingTechSignals,
    existingBulletsText,
    actionStyle,
    lineBudgetFit,
    isSubtleEdit,
  } = params;

  // 1. Base defensibility
  let score = isSubtleEdit ? 95 : 91;

  // 2. Domain & Context Proximity (+1 to +4)
  const kwLower = proposedKeywords.map((k) => k.toLowerCase());
  const hasKw = (k: string) => kwLower.some((x) => x.includes(k.toLowerCase()));

  if (domain === "ml-vision") {
    if (
      hasKw("torch") ||
      hasKw("metric") ||
      hasKw("eval") ||
      hasKw("dataset") ||
      hasKw("python") ||
      hasKw("docker")
    ) {
      score += 4;
    } else if (hasKw("redis") || hasKw("agile") || hasKw("jira") || hasKw("linear")) {
      score += 3;
    } else {
      score += 2;
    }
  } else if (domain === "voice-ai") {
    if (
      hasKw("redis") ||
      hasKw("websocket") ||
      hasKw("fastapi") ||
      hasKw("webhook") ||
      hasKw("api")
    ) {
      score += 4;
    } else if (hasKw("docker") || hasKw("aws") || hasKw("testing") || hasKw("agile")) {
      score += 3;
    } else {
      score += 2;
    }
  } else if (domain === "ml-research") {
    if (
      hasKw("python") ||
      hasKw("fastapi") ||
      hasKw("eval") ||
      hasKw("cross-val") ||
      hasKw("slurm")
    ) {
      score += 4;
    } else if (hasKw("docker") || hasKw("redis") || hasKw("agile")) {
      score += 3;
    } else {
      score += 2;
    }
  } else if (domain === "systems-robotics") {
    if (hasKw("gazebo") || hasKw("ros") || hasKw("test") || hasKw("c++") || hasKw("sim")) {
      score += 4;
    } else if (hasKw("docker") || hasKw("jira") || hasKw("agile")) {
      score += 3;
    } else {
      score += 1;
    }
  } else {
    if (
      hasKw("redis") ||
      hasKw("graphql") ||
      hasKw("rest") ||
      hasKw("postgres") ||
      hasKw("tailwind")
    ) {
      score += 4;
    } else if (hasKw("docker") || hasKw("aws") || hasKw("agile") || hasKw("jira")) {
      score += 3;
    } else {
      score += 2;
    }
  }

  // 3. Existing Tech Signal Continuity (+1 to +3)
  const allExistingLower = `${existingTechSignals.join(" ")} ${existingBulletsText}`.toLowerCase();
  const hasExisting = (k: string) => allExistingLower.includes(k.toLowerCase());

  if (
    hasKw("redis") &&
    (hasExisting("postgres") || hasExisting("supabase") || hasExisting("db") || hasExisting("api"))
  ) {
    score += 3;
  } else if (
    hasKw("docker") &&
    (hasExisting("python") ||
      hasExisting("fastapi") ||
      hasExisting("deploy") ||
      hasExisting("linux"))
  ) {
    score += 2;
  } else if (
    hasKw("graphql") &&
    (hasExisting("rest") || hasExisting("api") || hasExisting("react") || hasExisting("next"))
  ) {
    score += 2;
  } else if (
    hasKw("tailwind") &&
    (hasExisting("react") || hasExisting("next") || hasExisting("ui"))
  ) {
    score += 3;
  } else if (hasKw("fastapi") && hasExisting("python")) {
    score += 3;
  } else if (hasKw("agile") || hasKw("jira") || hasKw("linear")) {
    score += 2;
  }

  // 4. Action Style Modesty (+1 to +2)
  if (actionStyle === "Testing & Quality" || actionStyle === "Simple Integration") {
    score += 2;
  } else if (actionStyle === "Workflow & Ops") {
    score += 2;
  } else {
    score += 1;
  }

  // 5. Line-budget Visual Fit (+2 to -3)
  if (lineBudgetFit) {
    if (lineBudgetFit.tone === "green") {
      score += 2;
    } else if (lineBudgetFit.tone === "red") {
      score -= 3;
    }
  }

  const finalScore = Math.max(88, Math.min(98, score));

  const kwListStr = proposedKeywords.join(", ") || "target tool";
  let critique = "";
  let interviewDefense = "";

  if (actionStyle === "Testing & Quality") {
    critique = `High defensibility (${finalScore}%): framed as automated regression checks and test suites for ${containerTitle}. Interviewers respect testing without questioning authority.`;
    interviewDefense = `"I authored automated validation checks and regression suites to catch issues early and verify reliability before shipping."`;
  } else if (actionStyle === "Simple Integration") {
    critique = `Solid defensibility (${finalScore}%): integrates ${kwListStr} as client consumption or caching on top of ${containerTitle}. No complex distributed server architecture claimed.`;
    interviewDefense = `"We consumed ${kwListStr} as a standard integration to fetch and cache status updates alongside our existing stack."`;
  } else if (actionStyle === "Workflow & Ops") {
    critique = `Very low risk (${finalScore}%): positions ${kwListStr} purely as sprint ticket tracking and release coordination in ${containerTitle}.`;
    interviewDefense = `"Our team used ${kwListStr} for weekly sprint planning, ticket triage, and tracking feature milestones across releases."`;
  } else {
    critique = `Direct and credible (${finalScore}%): day-to-day coding in your primary language adding ${kwListStr} features to ${containerTitle}.`;
    interviewDefense = `"I implemented modular endpoints and data processing utilities using ${kwListStr} directly in our existing service."`;
  }

  return {
    score: finalScore,
    critique,
    interviewDefense,
  };
}
