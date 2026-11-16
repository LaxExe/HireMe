import type { Bullet, CalibrationConfig, MasterResume, SkillCategory } from "../types";
import type { BulletFitResult } from "../utils";

export interface TextSegment {
  text: string;
  isBold: boolean;
}

export interface LineBudgetCheck {
  valid: boolean;
  origWidth: number;
  candWidth: number;
  origLines: number;
  candLines: number;
  maxAllowedWidth: number;
  minAllowedWidth: number;
  slackNcu: number;
  delta: number;
  origChars: number;
  candChars: number;
  origFit: BulletFitResult;
  candFit: BulletFitResult;
}

export interface WordDiffToken {
  word: string;
  changed: boolean;
}

export interface WordReframeStats {
  reframedWords: number;
  withinCap: boolean;
  tokens: WordDiffToken[];
}

export type Tier =
  | "tier_0_workflow"
  | "tier_1_framing"
  | "tier_1_5_skills_only"
  | "tier_2_banned";

export type PolicyMode = "framing" | "evidence";

export interface LarpTierClassification {
  matched: string[];
  tier_0_workflow: string[];
  tier_1_framing: string[];
  tier_1_5_skills_only: string[];
  tier_2_banned: string[];
}

export type BulletDomainContext =
  | "backend-api-db"
  | "cloud-deploy-infra"
  | "frontend-ui"
  | "systems-cpp-robotics";

export interface CatalogItem {
  name: string;
  aliases: string[];
  defaultTierIfMissing: Tier;
  alsoSkillsOnly?: boolean;
  targetSkillCategory?:
    | "Languages"
    | "Frameworks & Libraries"
    | "Databases & Cloud"
    | "Developer Tools & DevOps";
  compatibleBulletContexts?: BulletDomainContext[];
}

export interface SkillSwapChange {
  categoryId: string;
  categoryName: string;
  added: string[];
  swappedOut: string[];
  origNcu: number;
  newNcu: number;
}

export interface SkillCandidateOption {
  name: string;
  tier: "tier_1_5_skills_only" | "tier_1_framing" | "custom";
  defaultSelected: boolean;
  recommendedSwap: boolean;
  targetCategoryId: string;
  targetCategoryName: string;
}

export interface BulletMutationProposal {
  bulletId: string;
  containerId: string;
  containerTitle: string;
  containerKind: "experience" | "project";
  contextCategory: BulletDomainContext;
  originalMarkup: string;
  mutatedMarkup: string;
  originalLatex: string;
  mutatedLatex: string;
  budget: LineBudgetCheck;
  wordStats: WordReframeStats;
  injectedKeywords: string[];
  reason: string;
  accepted: boolean;
}

export interface MalleableBulletOption {
  id: string;
  styleLabel:
    | "Casual & Direct"
    | "Simple Integration"
    | "Workflow & Ops"
    | "Testing & Quality"
    | string;
  markup: string;
  latex: string;
  chars: number;
  maxChars: number;
  widthNcu: number;
  fit: BulletFitResult;
  easyExplanation: string;
}

export interface MalleableSynthesizedBullet {
  id: string;
  targetContainerId: string;
  targetContainerTitle: string;
  targetContainerKind: "experience" | "project";
  targetTechContext: string[];
  markup: string;
  latex: string;
  chars: number;
  maxChars: number;
  widthNcu: number;
  fit: BulletFitResult;
  injectedKeywords: string[];
  roleContextSummary: string;
  believabilityScore: number;
  believabilityCritique: string;
  recommended: boolean;
  options: MalleableBulletOption[];
}

export interface AiVerificationPass {
  passNumber: number;
  name: string;
  status: "passed" | "refined" | "failed";
  detail: string;
}

export interface AiBelievabilityRecommendation {
  topPickId: string;
  topPickKind: "malleable-new-line" | "bullet-mutation";
  topPickTitle: string;
  believabilityScore: number;
  verdictSummary: string;
  whyMostBelievable: string;
  interviewTalkingPoint: string;
  iterationsRun: number;
  verificationPasses: AiVerificationPass[];
  rankings: {
    id: string;
    label: string;
    containerTitle: string;
    score: number;
    verdict: "Top Pick · Most Believable" | "Highly Defensible" | "Safe & Subtle";
    rationale: string;
  }[];
}

export interface ContainerCandidate {
  id: string;
  title: string;
  kind: "experience" | "project";
  companyOrProjectName: string;
  roleOrProjectType: string;
  existingBullets: string[];
  techSignals: string[];
  roleSummary: string;
  domain:
    | "ml-vision"
    | "ml-research"
    | "voice-ai"
    | "fullstack-backend"
    | "systems-robotics"
    | "general";
  score: number;
}

export interface CandidateBulletSlot {
  bullet: Bullet;
  containerId: string;
  containerTitle: string;
  containerKind: "experience" | "project";
  context: BulletDomainContext;
  defensibilityBonus: number;
  origPlainLen: number;
  maxAllowedChars: number;
  charSlack: number;
}

export interface LarpAlignmentRun {
  tiers: LarpTierClassification;
  skillSwaps: SkillSwapChange[];
  updatedSkills: SkillCategory[];
  bulletProposals: BulletMutationProposal[];
  malleableBullets: MalleableSynthesizedBullet[];
  aiRecommendation: AiBelievabilityRecommendation | null;
  guardrailVerifiedZeroBanned: boolean;
}

export type { Bullet, CalibrationConfig, MasterResume, SkillCategory, BulletFitResult };
