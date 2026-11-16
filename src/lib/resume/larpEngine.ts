export {
  type AiBelievabilityRecommendation,
  type AiVerificationPass,
  type BulletDomainContext,
  type BulletMutationProposal,
  type CatalogItem,
  type ContainerCandidate,
  type LarpAlignmentRun,
  type LarpTierClassification,
  type LineBudgetCheck,
  type MalleableBulletOption,
  type MalleableSynthesizedBullet,
  type PolicyMode,
  type SkillCandidateOption,
  type SkillSwapChange,
  type TextSegment,
  type Tier,
  type WordDiffToken,
  type WordReframeStats,
} from "./larp/types";

export { PYLON_TEST_JD } from "./larp/config";

export {
  checkLineBudget,
  computeVisualWidth,
  computeWordReframeStats,
  fitBulletToCalibratedLineArea,
  stripLatexCommandsKeepText,
} from "./larp/text";

export { classifyJobDescriptionTiers } from "./larp/jd";

export {
  applySelectedSkillsToResumeCategories,
  getAvailableSkillCandidates,
  smartSwapSkillsSection,
} from "./larp/skills";

export { classifyBulletContext } from "./larp/candidates";

export { calculateDynamicBelievabilityScore } from "./larp/scoring";

export {
  selectEligibleContainersForMalleableLines,
  synthesizeMalleableOneLineBullets,
} from "./larp/malleable";

export { evaluateBelievabilityAndRecommend } from "./larp/verify";

export { runLarpAlignmentPipeline } from "./larp/pipeline";

export {
  applyLarpMutationsToResume,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
} from "./larp/apply";
