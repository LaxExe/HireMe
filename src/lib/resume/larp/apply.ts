import { markupToLatex } from "../latex";
import { analyzeBullet, bulletFit, knownTools, plainText, splitItems, uid } from "../utils";
import { DEFAULT_CALIBRATION, SINGLE_LINE_NCU } from "./config";
import { applySelectedSkillsToResumeCategories } from "./skills";
import { checkLineBudget, computeVisualWidth, computeWordReframeStats } from "./text";
import type {
  Bullet,
  BulletMutationProposal,
  CalibrationConfig,
  LarpAlignmentRun,
  MalleableSynthesizedBullet,
  MasterResume,
} from "./types";

/**
 * Recalculates a `BulletMutationProposal` when the user manually edits its markup text in Operations or Preview.
 */
export function updateBulletProposalWithCustomMarkup(
  proposal: BulletMutationProposal,
  customMarkup: string,
  calibration?: CalibrationConfig
): BulletMutationProposal {
  const cal = calibration ?? DEFAULT_CALIBRATION;
  const candLatex = `\\item ${markupToLatex(customMarkup)}`;
  const budget = checkLineBudget(proposal.originalMarkup, customMarkup, cal, SINGLE_LINE_NCU);
  const wordStats = computeWordReframeStats(proposal.originalMarkup, customMarkup, 7);
  return {
    ...proposal,
    mutatedMarkup: customMarkup,
    mutatedLatex: candLatex,
    budget,
    wordStats,
  };
}

/**
 * Recalculates a `MalleableBulletOption` inside a `MalleableSynthesizedBullet` when the user manually edits its markup text.
 */
export function updateMalleableOptionWithCustomMarkup(
  malleable: MalleableSynthesizedBullet,
  optionId: string,
  customMarkup: string,
  calibration?: CalibrationConfig
): MalleableSynthesizedBullet {
  const cal = calibration ?? DEFAULT_CALIBRATION;
  const oneLineMax = cal.oneLineMax || 108;
  const nextOptions = malleable.options.map((opt) => {
    if (opt.id !== optionId) return opt;
    const latex = `\\item ${markupToLatex(customMarkup)}`;
    const chars = plainText(customMarkup).trim().length;
    const widthNcu = computeVisualWidth(latex);
    const fit = bulletFit(customMarkup, cal);
    return {
      ...opt,
      markup: customMarkup,
      latex,
      chars,
      maxChars: oneLineMax,
      widthNcu,
      fit,
    };
  });

  const activeOpt = nextOptions.find((o) => o.id === optionId) ?? nextOptions[0];
  return {
    ...malleable,
    markup: activeOpt?.markup ?? malleable.markup,
    latex: activeOpt?.latex ?? malleable.latex,
    chars: activeOpt?.chars ?? malleable.chars,
    widthNcu: activeOpt?.widthNcu ?? malleable.widthNcu,
    fit: activeOpt?.fit ?? malleable.fit,
    options: nextOptions,
  };
}

export function applyLarpMutationsToResume(
  resume: MasterResume,
  alignment: LarpAlignmentRun,
  acceptedBulletIds: Set<string>,
  applySkills = true,
  acceptedMalleableIds?: Set<string>,
  selectedMalleableOptionBySlotId?: Record<string, string>,
  selectedSkillNames?: string[],
  customSkillCategoryByName?: Record<string, string>
): MasterResume {
  const next: MasterResume = structuredClone(resume);
  if (selectedSkillNames !== undefined) {
    next.skills = applySelectedSkillsToResumeCategories(
      resume.skills,
      alignment.tiers,
      selectedSkillNames,
      customSkillCategoryByName
    ).updatedCategories;
  } else if (applySkills) {
    next.skills = structuredClone(alignment.updatedSkills);
  }

  const proposalByBulletId = new Map(
    alignment.bulletProposals
      .filter((p) => acceptedBulletIds.has(p.bulletId))
      .map((p) => [p.bulletId, p])
  );

  const known = knownTools(
    next.skills.flatMap((c) => c.skills.flatMap((s) => splitItems(s.name))),
    next.projects.map((p) => p.techStack.flatMap((t) => splitItems(t)))
  );

  for (const job of next.experience) {
    job.bullets = job.bullets.map((b) => {
      const prop = proposalByBulletId.get(b.id);
      if (!prop) return b;
      return {
        ...b,
        text: prop.mutatedMarkup,
        ...analyzeBullet(prop.mutatedMarkup, known),
      };
    });
  }

  for (const proj of next.projects) {
    proj.bullets = proj.bullets.map((b) => {
      const prop = proposalByBulletId.get(b.id);
      if (!prop) return b;
      return {
        ...b,
        text: prop.mutatedMarkup,
        ...analyzeBullet(prop.mutatedMarkup, known),
      };
    });
  }

  if (acceptedMalleableIds && acceptedMalleableIds.size > 0) {
    for (const mb of alignment.malleableBullets) {
      if (!acceptedMalleableIds.has(mb.id)) continue;
      const chosenOptId = selectedMalleableOptionBySlotId?.[mb.id];
      const chosenOpt =
        mb.options?.find((o) => o.id === chosenOptId) ?? mb.options?.[0];
      const chosenMarkup = chosenOpt?.markup ?? mb.markup;

      const newBullet: Bullet = {
        id: uid("b"),
        text: chosenMarkup,
        ...analyzeBullet(chosenMarkup, known),
      };
      if (mb.targetContainerKind === "experience") {
        const targetJob = next.experience.find((j) => j.id === mb.targetContainerId);
        if (targetJob) {
          targetJob.bullets.push(newBullet);
        }
      } else {
        const targetProj = next.projects.find((p) => p.id === mb.targetContainerId);
        if (targetProj) {
          targetProj.bullets.push(newBullet);
        }
      }
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}
