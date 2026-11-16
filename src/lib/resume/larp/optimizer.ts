import { markupToLatex } from "../latex";
import { tryMinimalKeywordInjection } from "./candidates";
import { evaluateCandidateGuardrails } from "./guardrails";
import { fitBulletToCalibratedLineArea } from "./text";
import type {
  BulletMutationProposal,
  CalibrationConfig,
  CandidateBulletSlot,
  LineBudgetCheck,
  WordReframeStats,
} from "./types";

export function selectBulletMutations(
  slots: CandidateBulletSlot[],
  centralizedTargetKeywords: string[],
  bannedLower: string[],
  cal: CalibrationConfig,
  variantOffset = 0,
  singleLineNcu = 98.0
): BulletMutationProposal[] {
  const usedBulletIds = new Set<string>();
  const bulletProposals: BulletMutationProposal[] = [];

  for (const keyword of centralizedTargetKeywords) {
    const validProposals: Array<{
      slot: CandidateBulletSlot;
      mutatedMarkup: string;
      reason: string;
      score: number;
      budget: LineBudgetCheck;
      wordStats: WordReframeStats;
    }> = [];

    for (const slot of slots) {
      if (usedBulletIds.has(slot.bullet.id)) continue;

      const attempt = tryMinimalKeywordInjection(slot.bullet.text, slot.context, keyword);
      if (!attempt) continue;

      const fittedMarkup = fitBulletToCalibratedLineArea(attempt.mutatedMarkup, cal);
      const guard = evaluateCandidateGuardrails(
        slot.bullet.text,
        fittedMarkup,
        bannedLower,
        cal,
        singleLineNcu,
        7
      );
      if (!guard.valid || !guard.budget || !guard.wordStats) continue;

      const greenBonus = guard.budget.candFit.tone === "green" ? 12 : 0;
      const totalScore =
        attempt.fitScore + slot.defensibilityBonus + greenBonus + Math.min(8, slot.charSlack / 6);

      validProposals.push({
        slot,
        mutatedMarkup: fittedMarkup,
        reason: attempt.reason,
        score: totalScore,
        budget: guard.budget,
        wordStats: guard.wordStats,
      });
    }

    if (validProposals.length > 0) {
      validProposals.sort((a, b) => b.score - a.score);
      const chosenIdx = variantOffset % validProposals.length;
      const bestProposal = validProposals[chosenIdx];

      usedBulletIds.add(bestProposal.slot.bullet.id);
      const origLatex = `\\item ${markupToLatex(bestProposal.slot.bullet.text)}`;
      const candLatex = `\\item ${markupToLatex(bestProposal.mutatedMarkup)}`;

      bulletProposals.push({
        bulletId: bestProposal.slot.bullet.id,
        containerId: bestProposal.slot.containerId,
        containerTitle: bestProposal.slot.containerTitle,
        containerKind: bestProposal.slot.containerKind,
        contextCategory: bestProposal.slot.context,
        originalMarkup: bestProposal.slot.bullet.text,
        mutatedMarkup: bestProposal.mutatedMarkup,
        originalLatex: origLatex,
        mutatedLatex: candLatex,
        budget: bestProposal.budget,
        wordStats: bestProposal.wordStats,
        injectedKeywords: [keyword],
        reason: bestProposal.reason,
        accepted: true,
      });
    }
  }

  return bulletProposals;
}
