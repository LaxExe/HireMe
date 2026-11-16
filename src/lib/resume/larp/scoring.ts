import { findCatalogEntry } from "./catalog";
import { containsPhrase } from "./text";
import type { BulletFitResult, Context, ScoreFeatures } from "./types";

/**
 * Explainable additive feature sum for scoring any candidate bullet edit or new malleable bullet:
 * - rewrite naturalness (`ruleScore * 0.5`)
 * - JD importance (`weight * 20`)
 * - minimal edit (`-2 * wordsChanged`)
 * - line fit (`+10` ideal, `-6` orphan/overflow)
 * - domain fit (`+8` if context overlaps, `-8` if mismatch, `0` neutral)
 * - pairsWith hit (`+10`)
 * - harder to verify (`+4` project, `+3` older role)
 */
export function scoreCandidate(params: {
  ruleScore: number;
  jdWeight?: number;
  wordsChanged: number;
  fit: BulletFitResult;
  domainOverlap: boolean;
  domainMismatch?: boolean;
  pairsWithHit: boolean;
  containerKind: "experience" | "project";
  isOlderRole?: boolean;
}): ScoreFeatures {
  const {
    ruleScore,
    jdWeight = 1.0,
    wordsChanged,
    fit,
    domainOverlap,
    domainMismatch = false,
    pairsWithHit,
    containerKind,
    isOlderRole = false,
  } = params;

  const rewriteNaturalness = Number((ruleScore * 0.5).toFixed(1));
  const jdImportance = Number((jdWeight * 20).toFixed(1));
  const minimalEdit = -2 * Math.max(0, wordsChanged);

  let lineFit = 0;
  if (fit.status === "ideal-1" || fit.status === "ideal-2") {
    lineFit = 10;
  } else if (fit.status === "orphan-2" || fit.status === "overflow") {
    lineFit = -6;
  }

  let domainFit = 0;
  if (domainOverlap) {
    domainFit = 8;
  } else if (domainMismatch) {
    domainFit = -8;
  }

  const pairsWithBonus = pairsWithHit ? 10 : 0;
  const harderToVerifyBonus =
    containerKind === "project" ? 4 : isOlderRole ? 3 : 0;

  const rawTotal =
    rewriteNaturalness +
    jdImportance +
    minimalEdit +
    lineFit +
    domainFit +
    pairsWithBonus +
    harderToVerifyBonus;

  const total = Math.max(0, Math.round(rawTotal));

  return {
    rewriteNaturalness,
    jdImportance,
    minimalEdit,
    lineFit,
    domainFit,
    pairsWithBonus,
    harderToVerifyBonus,
    total,
  };
}

export function formatScoreBreakdownSummary(features: ScoreFeatures): string {
  const parts: string[] = [
    `naturalness +${features.rewriteNaturalness}`,
    `JD weight +${features.jdImportance}`,
  ];
  if (features.minimalEdit !== 0) parts.push(`edit ${features.minimalEdit}`);
  if (features.lineFit !== 0)
    parts.push(`line fit ${features.lineFit > 0 ? `+${features.lineFit}` : features.lineFit}`);
  if (features.domainFit !== 0)
    parts.push(`domain ${features.domainFit > 0 ? `+${features.domainFit}` : features.domainFit}`);
  if (features.pairsWithBonus > 0) parts.push(`pairsWith +${features.pairsWithBonus}`);
  if (features.harderToVerifyBonus > 0)
    parts.push(`context +${features.harderToVerifyBonus}`);
  return `Score ${features.total} (${parts.join(", ")})`;
}

/**
 * Computes explainable feature-based believability score for malleable or mutated bullets,
 * replacing the legacy 88-98 clamp.
 */
export function calculateDynamicBelievabilityScore(params: {
  proposedKeywords: string[];
  containerKind: "experience" | "project";
  containerTitle: string;
  domain: Context;
  existingTechSignals: string[];
  existingBulletsText: string;
  actionStyle: string;
  lineBudgetFit?: BulletFitResult;
  isSubtleEdit?: boolean;
  isOlderRole?: boolean;
  jdWeight?: number;
  wordsChanged?: number;
}): {
  score: number;
  features: ScoreFeatures;
  critique: string;
  interviewDefense: string;
} {
  const {
    proposedKeywords,
    containerKind,
    containerTitle,
    domain,
    existingTechSignals,
    existingBulletsText,
    actionStyle,
    lineBudgetFit,
    isSubtleEdit = false,
    isOlderRole = false,
    jdWeight = 0.85,
    wordsChanged = isSubtleEdit ? 3 : 6,
  } = params;

  const primaryKw = proposedKeywords[0] ?? "";
  const entry = findCatalogEntry(primaryKw);
  const combinedSignals = `${existingTechSignals.join(" ")} ${existingBulletsText}`;

  const pairsWithHit =
    entry?.pairsWith?.some((pw) => containsPhrase(combinedSignals, pw)) ??
    existingTechSignals.some((s) =>
      proposedKeywords.some((k) => s.toLowerCase() === k.toLowerCase())
    );

  const domainOverlap =
    entry?.contexts?.includes(domain) ??
    (domain !== "general" && proposedKeywords.length > 0);
  const domainMismatch =
    domain === "systems" &&
    entry?.contexts !== undefined &&
    !entry.contexts.includes("systems");

  const ruleScore =
    actionStyle === "Testing & Quality" || actionStyle === "Simple Integration"
      ? 92
      : actionStyle === "Workflow & Ops"
      ? 90
      : 88;

  const fit: BulletFitResult = lineBudgetFit ?? {
    length: 100,
    status: "ideal-1",
    targetLines: 1,
    line1Progress: 0.92,
    line2Progress: 0,
    overallRatio: 0.46,
    label: "1 line full",
    tooltip: "",
    badge: "1L",
    tone: "green",
  };

  const features = scoreCandidate({
    ruleScore,
    jdWeight,
    wordsChanged,
    fit,
    domainOverlap,
    domainMismatch,
    pairsWithHit,
    containerKind,
    isOlderRole,
  });

  const kwListStr = proposedKeywords.join(", ") || "target tool";
  const breakdown = formatScoreBreakdownSummary(features);
  const critique = `${breakdown} · Framed as ${actionStyle.toLowerCase()} in ${containerTitle} (${kwListStr}).`;
  const interviewDefense = `"We integrated ${kwListStr} within ${containerTitle} alongside our existing ${
    existingTechSignals.slice(0, 3).join(", ") || "core"
  } stack."`;

  return {
    score: features.total,
    features,
    critique,
    interviewDefense,
  };
}
