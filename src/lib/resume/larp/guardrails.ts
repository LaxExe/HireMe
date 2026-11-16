import { plainText } from "../utils";
import { checkLineBudget, computeWordReframeStats, containsPhrase } from "./text";
import type {
  BulletMutationProposal,
  CalibrationConfig,
  LineBudgetCheck,
  MalleableSynthesizedBullet,
  SkillCategory,
  WordReframeStats,
} from "./types";

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
  maxWordsCap = 7
): { valid: boolean; budget?: LineBudgetCheck; wordStats?: WordReframeStats } {
  if (!verifyZeroBannedInMarkup(fittedMarkup, bannedLower)) {
    return { valid: false };
  }
  const budget = checkLineBudget(origMarkup, fittedMarkup, cal, singleLineNcu);
  if (!budget.valid) {
    return { valid: false, budget };
  }
  const wordStats = computeWordReframeStats(origMarkup, fittedMarkup, maxWordsCap);
  if (!wordStats.withinCap) {
    return { valid: false, budget, wordStats };
  }
  return { valid: true, budget, wordStats };
}
