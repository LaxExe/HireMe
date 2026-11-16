export {
  type AiBelievabilityRecommendation,
  type AiVerificationPass,
  type BulletDomainContext,
  type BulletMutationProposal,
  type CatalogEntry,
  type CatalogItem,
  type ContainerCandidate,
  type Context,
  type GuardrailViolation,
  type LarpAlignmentRun,
  type LarpTierClassification,
  type LineBudgetCheck,
  type MalleableBulletOption,
  type MalleableSynthesizedBullet,
  type PolicyMode,
  type ScoreFeatures,
  type SkillCandidateOption,
  type SkillSwapChange,
  type TextSegment,
  type Tier,
  type ViolationCode,
  type WordDiffToken,
  type WordReframeStats,
} from "./larp/types";

export { DOMAIN_HINTS, inferDomainTags, PYLON_TEST_JD } from "./larp/config";
export {
  catalogFromDictionary,
  EXTENDED_LARP_CATALOG,
  findCatalogEntry,
  LARP_CATALOG,
} from "./larp/catalog";
export { buildResumeInventory, placementFor } from "./larp/policy";
export {
  createGuardContext,
  defaultHeuristicMeasurer,
  extractMetricsAndNumbers,
  validateRewrite,
  type GuardContext,
  type Measurer,
} from "./larp/guardrails";

export {
  checkLineBudget,
  computeVisualWidth,
  computeWordReframeStats,
  fitBulletToCalibratedLineArea,
  stripLatexCommandsKeepText,
} from "./larp/text";

export {
  classifyJobDescriptionTiers,
  computeCoverageBeforeAfter,
  extractUnknownTechnicalTerms,
  extractWeightedJdKeywords,
  type CoverageReport,
  type WeightedJdKeyword,
} from "./larp/jd";

export {
  applySelectedSkillsToResumeCategories,
  getAvailableSkillCandidates,
  smartSwapSkillsSection,
} from "./larp/skills";

export {
  checkSlotPlausibility,
  classifyBulletContext,
  type PlausibilityCheckResult,
} from "./larp/candidates";

export {
  calculateDynamicBelievabilityScore,
  formatScoreBreakdownSummary,
  scoreCandidate,
} from "./larp/scoring";

export {
  autoTagResumeContainers,
  selectEligibleContainersForMalleableLines,
  synthesizeMalleableOneLineBullets,
} from "./larp/malleable";

export {
  evaluateBelievabilityAndRecommend,
  runRealVerificationPasses,
  type RealVerificationInput,
} from "./larp/verify";

export {
  buildBulletRewritePrompt,
  clearLlmRewriteCache,
  DEFAULT_LLM_MODEL,
  draftAndValidateLlmMalleableOptions,
  parseLlmRewritesJson,
  PROMPT_VERSION,
  proposeAndValidateLlmBulletCandidates,
  shortlistPlausibleSlotsForKeyword,
  wordJaccardSimilarity,
  type Completer,
  type LlmTelemetry,
  type LlmValidatedCandidate,
} from "./larp/llm";

export {
  selectBulletMutations,
  solveMaxWeightAssignment,
  type KeywordCandidateStats,
} from "./larp/optimizer";

export {
  runLarpAlignmentPipeline,
  runLarpAlignmentPipelineAsync,
  type LarpPipelineOptions,
} from "./larp/pipeline";

export {
  applyLarpMutationsToResume,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
} from "./larp/apply";
