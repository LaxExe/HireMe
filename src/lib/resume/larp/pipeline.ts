import { plainText } from "../utils";
import { classifyBulletContext } from "./candidates";
import { DEFAULT_CALIBRATION, SINGLE_LINE_NCU } from "./config";
import { verifyRunGuardrailZeroBanned } from "./guardrails";
import { classifyJobDescriptionTiers } from "./jd";
import { synthesizeMalleableOneLineBullets } from "./malleable";
import { selectBulletMutations } from "./optimizer";
import { getCentralizedTargetKeywords } from "./policy";
import { smartSwapSkillsSection } from "./skills";
import type { CandidateBulletSlot, LarpAlignmentRun, MasterResume } from "./types";
import { evaluateBelievabilityAndRecommend } from "./verify";

export function runLarpAlignmentPipeline(
  jobDescription: string,
  resume: MasterResume,
  variantOffset = 0
): LarpAlignmentRun {
  const tiers = classifyJobDescriptionTiers(jobDescription, resume);
  const { updatedCategories, changes: skillSwaps } = smartSwapSkillsSection(
    resume.skills,
    tiers,
    SINGLE_LINE_NCU
  );

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || 108;
  const twoLineMaxChars = cal.twoLineMax || 216;

  const slots: CandidateBulletSlot[] = [];

  resume.experience.forEach((job, jobIdx) => {
    for (const bullet of job.bullets) {
      const origPlainLen = plainText(bullet.text).trim().length;
      if (origPlainLen === 0) continue;
      const origLines = origPlainLen <= oneLineMaxChars ? 1 : 2;
      const maxAllowedChars = origLines === 1 ? oneLineMaxChars : twoLineMaxChars;
      const charSlack = maxAllowedChars - origPlainLen;
      const context = classifyBulletContext(bullet.text, `${job.title} ${job.company}`);
      const defensibilityBonus = jobIdx > 0 ? 5 : 0;

      slots.push({
        bullet,
        containerId: job.id,
        containerTitle: `${job.title} · ${job.company}`,
        containerKind: "experience",
        context,
        defensibilityBonus,
        origPlainLen,
        maxAllowedChars,
        charSlack,
      });
    }
  });

  for (const proj of resume.projects) {
    for (const bullet of proj.bullets) {
      const origPlainLen = plainText(bullet.text).trim().length;
      if (origPlainLen === 0) continue;
      const origLines = origPlainLen <= oneLineMaxChars ? 1 : 2;
      const maxAllowedChars = origLines === 1 ? oneLineMaxChars : twoLineMaxChars;
      const charSlack = maxAllowedChars - origPlainLen;
      const context = classifyBulletContext(bullet.text, `${proj.name} ${proj.techStack.join(" ")}`);

      slots.push({
        bullet,
        containerId: proj.id,
        containerTitle: proj.name,
        containerKind: "project",
        context,
        defensibilityBonus: 6,
        origPlainLen,
        maxAllowedChars,
        charSlack,
      });
    }
  }

  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const centralizedTargetKeywords = getCentralizedTargetKeywords(
    tiers.tier_1_framing,
    tiers.tier_0_workflow
  );

  const bulletProposals = selectBulletMutations(
    slots,
    centralizedTargetKeywords,
    bannedLower,
    cal,
    variantOffset,
    SINGLE_LINE_NCU
  );

  const malleableCount = cal.malleableLines ?? 1;
  const malleableBullets = synthesizeMalleableOneLineBullets(
    resume,
    tiers,
    malleableCount,
    variantOffset
  );
  const aiRecommendation = evaluateBelievabilityAndRecommend(malleableBullets, bulletProposals);

  const guardrailVerifiedZeroBanned = verifyRunGuardrailZeroBanned(
    updatedCategories,
    bulletProposals,
    malleableBullets,
    bannedLower
  );

  return {
    tiers,
    skillSwaps,
    updatedSkills: updatedCategories,
    bulletProposals,
    malleableBullets,
    aiRecommendation,
    guardrailVerifiedZeroBanned,
  };
}
