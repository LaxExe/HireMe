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
  type KeywordDiagnostic,
  type KeywordDiagnosticStatus,
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
  registerCustomCatalogTerm,
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
  createFontMetricMeasurer,
  defaultFontMeasurer,
  fitBulletToCalibratedLineArea,
  heuristicMeasurer,
  measureMarkupWithMeasurer,
  stripLatexCommandsKeepText,
  verifyPdfRenderLineCounts,
  type PdfRenderCalibrationAudit,
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
  type SynthesizeMalleableOptions,
} from "./larp/malleable";

export {
  buildKeywordDiagnostics,
  evaluateBelievabilityAndRecommend,
  runRealVerificationPasses,
  type RealVerificationInput,
} from "./larp/verify";

export {
  apiCompleter,
  buildForbiddenLabelsList,
  buildPrompt,
  clearLlmRewriteCache,
  DEFAULT_LLM_MODEL,
  DRAFT_SYSTEM,
  draftAndValidateLlmMalleableOptions,
  EXAMPLES,
  JUDGE_SYSTEM,
  judge,
  parseLlmRewritesJson,
  parseRewrites,
  pLimit,
  PROMPT_VERSION,
  proposeAndValidateLlmBulletCandidates,
  proposeWithLlm,
  shortlistPlausibleSlotsForKeyword,
  SYSTEM,
  wordJaccardSimilarity,
  type Completer,
  type LlmRequest,
  type LlmTelemetry,
  type LlmValidatedCandidate,
  type Prompt,
} from "./larp/llm";

export {
  selectBulletMutations,
  solveMaxWeightAssignment,
  type KeywordCandidateStats,
} from "./larp/optimizer";

export {
  buildRunLedger,
  buildRunMetadata,
  exportLedgerToCsv,
  exportLedgerToJson,
  formatSyntheticResumeFilename,
  getLarpUserEvents,
  logLarpUserActionEvent,
  resolveTierForKeyword,
  type LarpRunMetadata,
  type LarpUserActionEvent,
  type LedgerEntry,
} from "./larp/ledger";

export {
  FOCUSED_ALIGNMENT_PROMPT_VERSION,
  runLarpAlignmentPipeline,
  runLarpAlignmentPipelineAsync,
  type LarpPipelineOptions,
} from "./larp/pipeline";

export {
  applyLarpMutationsToResume,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
} from "./larp/apply";
