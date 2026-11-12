import type { Bullet, CalibrationConfig, MasterResume, SkillCategory } from "./types";
import { DEFAULT_CALIBRATION } from "./types";
import {
  analyzeBullet,
  bulletFit,
  escapeRegExp,
  knownTools,
  plainText,
  splitItems,
  uid,
  type BulletFitResult,
} from "./utils";
import { markupToLatex } from "./latex";

/* ============================================================================
 * 1. DETERMINISTIC LATEX VISUAL WIDTH CALCULATOR (NCU) & CALIBRATED LINE FIT
 * ============================================================================ */

const NARROW_CHARS = new Set("iIlj1!|.,:;'`()[] ");
const WIDE_CHARS = new Set("mMwW@%GHOQUD");
const UPPER_CHARS = new Set("ABCEFKJLNPRSTVXYZ");

export interface TextSegment {
  text: string;
  isBold: boolean;
}

/**
 * Parses a LaTeX bullet string (`\textbf{...}`) OR internal markup string (`**...**`)
 * into a list of `(text_segment, is_bold)` tuples.
 */
export function stripLatexCommandsKeepText(inputStr: string): TextSegment[] {
  if (!inputStr) return [];

  const normalized = inputStr.includes("**")
    ? inputStr.replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}")
    : inputStr;

  const cleaned = normalized
    .replace(/^\\item\s+/, "")
    .replace(/^\\resumeItem\{([\s\S]*)\}$/, "$1")
    .replace(/\\([%$&_{}#])/g, "$1")
    .replace(/\$\\sim\$/g, "~");

  const segments: TextSegment[] = [];
  let pos = 0;
  const pattern = /\\textbf\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    if (match.index > pos) {
      segments.push({ text: cleaned.slice(pos, match.index), isBold: false });
    }
    segments.push({ text: match[1], isBold: true });
    pos = match.index + match[0].length;
  }

  if (pos < cleaned.length) {
    segments.push({ text: cleaned.slice(pos), isBold: false });
  }

  return segments;
}

/**
 * Computes the visual width in Normalized Character Units (NCU).
 * 1 standard line at 0.4in-0.5in margins is approximately 98.0 NCU.
 */
export function computeVisualWidth(latexOrMarkupStr: string): number {
  const segments = stripLatexCommandsKeepText(latexOrMarkupStr);
  let totalWidth = 0.0;

  for (const { text, isBold } of segments) {
    const boldMultiplier = isBold ? 1.12 : 1.0;
    for (const ch of text) {
      let w = 1.0;
      if (NARROW_CHARS.has(ch)) {
        w = 0.52;
      } else if (WIDE_CHARS.has(ch)) {
        w = 1.42;
      } else if (UPPER_CHARS.has(ch)) {
        w = 1.22;
      }
      totalWidth += w * boldMultiplier;
    }
  }

  return Number(totalWidth.toFixed(2));
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

/**
 * Checks whether the candidate fits within the calibrated 1-line (`oneLineMax`)
 * or 2-line (`twoLineMax`) area without overflowing.
 */
export function checkLineBudget(
  originalMarkup: string,
  candidateMarkup: string,
  calibration: CalibrationConfig = DEFAULT_CALIBRATION,
  singleLineNcu = 98.0
): LineBudgetCheck {
  const origLatex = `\\item ${markupToLatex(originalMarkup)}`;
  const candLatex = `\\item ${markupToLatex(candidateMarkup)}`;

  const origWidth = computeVisualWidth(origLatex);
  const candWidth = computeVisualWidth(candLatex);

  const origFit = bulletFit(originalMarkup, calibration);
  const candFit = bulletFit(candidateMarkup, calibration);

  const origLines = origFit.targetLines === 1 ? 1 : 2;
  const candLines = candFit.targetLines;

  const maxAllowedChars =
    candLines === 1 ? calibration.oneLineMax : calibration.twoLineMax;
  const maxAllowedWidth = Number((candLines * singleLineNcu).toFixed(2));
  const minAllowedWidth = Number(
    ((candLines - 1) * singleLineNcu + 0.65 * singleLineNcu).toFixed(2)
  );
  const slackNcu = Number((maxAllowedWidth - origWidth).toFixed(2));

  // Valid if it lands in the calibrated 1-line or 2-line area (never >2L overflow, and ideally green 1L or 2L)
  const valid =
    candFit.status !== "overflow" &&
    candFit.length <= maxAllowedChars &&
    (candFit.tone === "green" || candFit.targetLines <= origLines);

  return {
    valid,
    origWidth,
    candWidth,
    origLines,
    candLines,
    maxAllowedWidth,
    minAllowedWidth,
    slackNcu,
    delta: Number((candWidth - origWidth).toFixed(2)),
    origChars: origFit.length,
    candChars: candFit.length,
    origFit,
    candFit,
  };
}

/* ============================================================================
 * 2. LINE-FIT TIGHTENER & EXPANDER (FITS BULLET INTO 1-LINE OR 2-LINE AREA)
 * ============================================================================ */

const COMPRESSION_RULES: [RegExp, string][] = [
  [/\bDeveloped and maintained\b/gi, "Built"],
  [/\bDesigned and developed\b/gi, "Built"],
  [/\bDesigned and optimized\b/gi, "Optimized"],
  [/\bImplemented core\b/gi, "Built"],
  [/\bfor patient coverage verification\b/gi, "for coverage checks"],
  [/\bthat automate data gathering from insurance providers\b/gi, "automating insurer data lookup"],
  [/\brule-based dispatch logic\b/gi, "dispatch logic"],
  [/\bon test data by building\b/gi, "by building"],
  [/\bto predict procedure coverage from prior patient visits\b/gi, "to predict procedure coverage"],
  [/\brelational (\*\*PostgreSQL\*\*)/gi, "$1"],
  [/\bto standardize eligibility records across\b/gi, "standardizing eligibility data across"],
  [/\bAcross (\*\*\d+\*\*) internal services/gi, "across $1 services"],
  [/\bacross (\*\*\d+\*\*) internal services/gi, "across $1 services"],
  [/\bover call workflows and dispatch timing by building\b/gi, "over dispatch workflows, building"],
  [/\bcustomizable dashboards\b/gi, "custom dashboards"],
  [/\bfrom a (\*\*4-hour\*\*) baseline by architecting a scalable\b/gi, "from $1 via a"],
  [/\bto clean, validate, and reformat\b/gi, "to clean and format"],
  [/\band tested on (\*\*100\*\*) trial interactions\b/gi, "across $1 trials"],
  [/\busing (\*\*LLM\*\*) prompt engineering, persisting structured\b/gi, "with $1 prompts, persisting"],
  [/\bmaintaining release reliability through an automated\b/gi, "via an automated"],
  [/\bin order to\b/gi, "to"],
  [/\bresulting in a\b/gi, "driving a"],
  [/\bby building\b/gi, "building"],
  [/\butilizing\b/gi, "using"],
  [/\bleveraging\b/gi, "using"],
];

/**
 * Rewrites/tightens a modified bullet so its character length fits cleanly inside
 * the user's calibrated 1-line area (`<= oneLineMax`) or 2-line area (`<= twoLineMax`)
 * without overflowing or leaving an awkward orphan wrap.
 */
export function fitBulletToCalibratedLineArea(
  candidateMarkup: string,
  calibration: CalibrationConfig = DEFAULT_CALIBRATION
): string {
  let current = candidateMarkup.trim();
  const oneMax = Math.max(1, calibration.oneLineMax || DEFAULT_CALIBRATION.oneLineMax);
  const twoMax = Math.max(oneMax + 1, calibration.twoLineMax || DEFAULT_CALIBRATION.twoLineMax);

  let fit = bulletFit(current, calibration);

  // Case 1: The bullet is slightly over 1-line max (e.g., 109..136 chars — an accidental 2-line orphan!)
  // Try compressing filler phrases so it fits cleanly inside the 1-line area (`<= oneMax`, Green `1L`)!
  if (fit.length > oneMax && fit.length <= oneMax + 28) {
    let test1L = current;
    for (const [pattern, replacement] of COMPRESSION_RULES) {
      if (plainText(test1L).trim().length <= oneMax) break;
      if (pattern.test(test1L)) {
        test1L = test1L.replace(pattern, replacement).replace(/\s{2,}/g, " ").trim();
      }
    }
    const after1LFit = bulletFit(test1L, calibration);
    if (after1LFit.length <= oneMax && after1LFit.tone === "green") {
      return test1L;
    }
  }

  // Case 2: The bullet exceeds `twoLineMax` (> 2 lines overflow).
  // Apply surgical phrase tightenings until `length <= twoMax` (fits inside 2-line area).
  if (fit.length > twoMax) {
    for (const [pattern, replacement] of COMPRESSION_RULES) {
      if (plainText(current).trim().length <= twoMax) break;
      if (pattern.test(current)) {
        current = current.replace(pattern, replacement).replace(/\s{2,}/g, " ").trim();
      }
    }
    fit = bulletFit(current, calibration);
  }

  // Case 3: The bullet is in the 2-line range (`> oneMax` and `<= twoMax`), but is an `orphan-2`
  // (line 2 is < 65% filled). If it cannot compress to 1 line, add a concise, context-matching
  // technical clause so it fills the 2-line area (`ideal-2` Green) cleanly!
  if (fit.status === "orphan-2") {
    const minIdeal2 = oneMax + Math.ceil(0.65 * (twoMax - oneMax));
    const needed = minIdeal2 - fit.length;
    if (needed > 0 && needed <= 48) {
      if (/\bPostgreSQL\b/i.test(current) && !/low-latency/i.test(current)) {
        const expanded = current.replace(
          /\.$/,
          " for low-latency data access and schema consistency."
        );
        if (bulletFit(expanded, calibration).tone === "green") {
          return expanded;
        }
      }
      if (/\bSupabase\b|\bFlask\b|\bAPIs\b/i.test(current) && !/automated retries/i.test(current)) {
        const expanded = current.replace(
          /\.$/,
          " with automated schema validation and retry handling."
        );
        if (bulletFit(expanded, calibration).tone === "green") {
          return expanded;
        }
      }
    }
  }

  return current;
}

/* ============================================================================
 * 3. WORD-DIFF TRACKER
 * ============================================================================ */

export interface WordDiffToken {
  word: string;
  changed: boolean;
}

export interface WordReframeStats {
  reframedWords: number;
  withinCap: boolean;
  tokens: WordDiffToken[];
}

function normalizeWordForDiff(w: string): string {
  return w
    .replace(/\*\*/g, "")
    .replace(/^[^a-zA-Z0-9%+#.]+|[^a-zA-Z0-9%+#.]+$/g, "")
    .toLowerCase();
}

export function computeWordReframeStats(
  originalMarkup: string,
  candidateMarkup: string,
  maxWordsCap = 7
): WordReframeStats {
  const origWords = plainText(originalMarkup).trim().split(/\s+/).filter(Boolean);
  const candRawWords = candidateMarkup.trim().split(/\s+/).filter(Boolean);
  const origNorm = origWords.map(normalizeWordForDiff);
  const candNorm = candRawWords.map(normalizeWordForDiff);

  const m = origNorm.length;
  const n = candNorm.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origNorm[i] && origNorm[i] === candNorm[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const tokens: WordDiffToken[] = [];
  let i = 0;
  let j = 0;
  let reframedWords = 0;

  while (j < n) {
    if (i < m && origNorm[i] === candNorm[j]) {
      tokens.push({ word: candRawWords[j], changed: false });
      i++;
      j++;
    } else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      tokens.push({ word: candRawWords[j], changed: true });
      reframedWords++;
      j++;
    }
  }

  return {
    reframedWords,
    withinCap: reframedWords > 0 && reframedWords <= maxWordsCap,
    tokens,
  };
}

/* ============================================================================
 * 4. THE 4-TIER KEYWORD CLASSIFICATION SPEC
 * ============================================================================ */

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

interface CatalogItem {
  name: string;
  aliases: string[];
  defaultTierIfMissing:
    | "tier_0_workflow"
    | "tier_1_framing"
    | "tier_1_5_skills_only"
    | "tier_2_banned";
  alsoSkillsOnly?: boolean;
  targetSkillCategory?:
    | "Languages"
    | "Frameworks & Libraries"
    | "Databases & Cloud"
    | "Developer Tools & DevOps";
  compatibleBulletContexts?: BulletDomainContext[];
}

const LARP_CATALOG: CatalogItem[] = [
  // Hard Primary Languages & Deep Internals -> TIER_2_BANNED if user does not already have them
  { name: "Golang", aliases: ["golang", "go"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Rust", aliases: ["rust", "rustlang"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Scala", aliases: ["scala"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Ruby on Rails", aliases: ["ruby on rails", "rails", "ruby"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Frameworks & Libraries" },
  { name: "CUDA", aliases: ["cuda", "tensorrt"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Kubernetes", aliases: ["kubernetes", "k8s", "eks", "helm"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "C#", aliases: ["c#", "csharp", ".net", "asp.net"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Kotlin", aliases: ["kotlin"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Swift", aliases: ["swift", "swiftui"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Elixir", aliases: ["elixir", "erlang"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "PHP", aliases: ["php", "laravel"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "C++", aliases: ["c++", "c++17", "c++20", "cpp"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Java", aliases: ["java", "spring boot", "jvm"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },
  { name: "Python", aliases: ["python", "python3"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Languages" },

  // Standard Web / Data Languages & Frameworks
  { name: "TypeScript", aliases: ["typescript", "ts"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Languages" },
  { name: "JavaScript", aliases: ["javascript", "js"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Languages" },
  { name: "SQL", aliases: ["sql"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Languages" },
  { name: "React", aliases: ["react", "react.js", "reactjs"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Next.js", aliases: ["next.js", "nextjs"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Node.js", aliases: ["node.js", "nodejs", "node"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "FastAPI", aliases: ["fastapi"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Flask", aliases: ["flask"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Express", aliases: ["express", "express.js"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "PyTorch", aliases: ["pytorch"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Pandas", aliases: ["pandas"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  {
    name: "Tailwind CSS",
    aliases: ["tailwind", "tailwind css", "tailwindcss"],
    defaultTierIfMissing: "tier_1_framing",
    alsoSkillsOnly: true,
    targetSkillCategory: "Frameworks & Libraries",
    compatibleBulletContexts: ["frontend-ui"],
  },

  // TIER 1: Concrete Technical Wrappers & Integrations (Centralized 1-spot injection in code bullets)
  {
    name: "AWS",
    aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"],
    defaultTierIfMissing: "tier_1_framing",
    alsoSkillsOnly: true,
    targetSkillCategory: "Databases & Cloud",
    compatibleBulletContexts: ["cloud-deploy-infra", "backend-api-db"],
  },
  {
    name: "Redis",
    aliases: ["redis"],
    defaultTierIfMissing: "tier_1_framing",
    alsoSkillsOnly: true,
    targetSkillCategory: "Databases & Cloud",
    compatibleBulletContexts: ["backend-api-db"],
  },
  {
    name: "GraphQL",
    aliases: ["graphql"],
    defaultTierIfMissing: "tier_1_framing",
    alsoSkillsOnly: true,
    targetSkillCategory: "Frameworks & Libraries",
    compatibleBulletContexts: ["backend-api-db", "frontend-ui"],
  },
  {
    name: "Webhooks",
    aliases: ["webhook", "webhooks"],
    defaultTierIfMissing: "tier_1_framing",
    compatibleBulletContexts: ["backend-api-db", "cloud-deploy-infra"],
  },
  {
    name: "Docker",
    aliases: ["docker", "containerization", "containers"],
    defaultTierIfMissing: "tier_1_framing",
    alsoSkillsOnly: true,
    targetSkillCategory: "Developer Tools & DevOps",
    compatibleBulletContexts: ["cloud-deploy-infra", "backend-api-db"],
  },
  {
    name: "CI/CD",
    aliases: ["ci/cd", "continuous integration", "continuous deployment"],
    defaultTierIfMissing: "tier_0_workflow",
    alsoSkillsOnly: true,
    targetSkillCategory: "Developer Tools & DevOps",
    compatibleBulletContexts: ["cloud-deploy-infra"],
  },

  // TIER 1.5: Skills Section Only
  { name: "PostgreSQL", aliases: ["postgresql", "postgres"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "MongoDB", aliases: ["mongodb", "mongo"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Supabase", aliases: ["supabase"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Firebase", aliases: ["firebase", "firestore"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "GitHub Actions", aliases: ["github actions"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Postman", aliases: ["postman"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Vercel", aliases: ["vercel"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Cloudflare", aliases: ["cloudflare"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Git", aliases: ["git", "github"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Linux", aliases: ["linux", "unix"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "REST APIs", aliases: ["rest", "rest api", "rest apis", "restful"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },

  // TIER 0: Workflow & Agile (Centralized 1-spot injection + Skills section)
  {
    name: "Jira",
    aliases: ["jira"],
    defaultTierIfMissing: "tier_0_workflow",
    alsoSkillsOnly: true,
    targetSkillCategory: "Developer Tools & DevOps",
    compatibleBulletContexts: ["frontend-ui", "backend-api-db", "cloud-deploy-infra"],
  },
  {
    name: "Linear",
    aliases: ["linear"],
    defaultTierIfMissing: "tier_0_workflow",
    alsoSkillsOnly: true,
    targetSkillCategory: "Developer Tools & DevOps",
    compatibleBulletContexts: ["frontend-ui", "backend-api-db", "cloud-deploy-infra"],
  },
  {
    name: "Agile",
    aliases: ["agile", "scrum", "kanban", "sprints"],
    defaultTierIfMissing: "tier_0_workflow",
    compatibleBulletContexts: ["frontend-ui", "backend-api-db", "cloud-deploy-infra"],
  },
  {
    name: "end-to-end",
    aliases: ["end-to-end", "end to end", "e2e ownership"],
    defaultTierIfMissing: "tier_0_workflow",
    compatibleBulletContexts: ["frontend-ui", "backend-api-db", "cloud-deploy-infra"],
  },
];

function containsPhrase(haystack: string, phrase: string): boolean {
  const clean = phrase.trim();
  if (!clean) return false;
  const re = new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegExp(clean)}(?![A-Za-z0-9+#])`, "i");
  return re.test(haystack);
}

function buildResumeCorpus(resume: MasterResume): string {
  const parts: string[] = [];
  for (const c of resume.skills) {
    parts.push(c.name, ...c.skills.map((s) => s.name), ...c.skills.flatMap((s) => splitItems(s.name)));
  }
  for (const j of resume.experience) {
    parts.push(j.title, j.company, ...j.bullets.map((b) => plainText(b.text)));
  }
  for (const p of resume.projects) {
    parts.push(p.name, ...p.techStack, ...p.bullets.map((b) => plainText(b.text)));
  }
  return parts.join(" \n ");
}

export function classifyJobDescriptionTiers(
  jobDescription: string,
  resume: MasterResume
): LarpTierClassification {
  const result: LarpTierClassification = {
    matched: [],
    tier_0_workflow: [],
    tier_1_framing: [],
    tier_1_5_skills_only: [],
    tier_2_banned: [],
  };

  const jd = jobDescription.trim();
  if (!jd) return result;

  const resumeCorpus = buildResumeCorpus(resume);

  for (const item of LARP_CATALOG) {
    const inJd = item.aliases.some((a) => containsPhrase(jd, a));
    if (!inJd) continue;

    const inResume = item.aliases.some((a) => containsPhrase(resumeCorpus, a));
    if (inResume) {
      result.matched.push(item.name);
      continue;
    }

    if (item.defaultTierIfMissing === "tier_0_workflow") {
      result.tier_0_workflow.push(item.name);
      if (item.alsoSkillsOnly) {
        result.tier_1_5_skills_only.push(item.name);
      }
    } else if (item.defaultTierIfMissing === "tier_1_framing") {
      result.tier_1_framing.push(item.name);
      if (item.alsoSkillsOnly) {
        result.tier_1_5_skills_only.push(item.name);
      }
    } else if (item.defaultTierIfMissing === "tier_1_5_skills_only") {
      result.tier_1_5_skills_only.push(item.name);
    } else if (item.defaultTierIfMissing === "tier_2_banned") {
      result.tier_2_banned.push(item.name);
    }
  }

  return result;
}

/* ============================================================================
 * 5. STEP 2: SKILLS SECTION SMART-SWAPPER (<= 98.0 NCU invariant)
 * ============================================================================ */

export interface SkillSwapChange {
  categoryId: string;
  categoryName: string;
  added: string[];
  swappedOut: string[];
  origNcu: number;
  newNcu: number;
}

function formatCategoryLatexLine(categoryName: string, skillNames: string[]): string {
  return `\\textbf{${categoryName}:} ${skillNames.join(", ")}`;
}

function matchCategoryBucket(
  catName: string
): "Languages" | "Frameworks & Libraries" | "Databases & Cloud" | "Developer Tools & DevOps" {
  const upper = catName.toUpperCase();
  if (/LANGUAGE/.test(upper)) return "Languages";
  if (/FRAMEWORK|LIBRAR/.test(upper)) return "Frameworks & Libraries";
  if (/DATABASE|CLOUD|DATA|STORAGE/.test(upper)) return "Databases & Cloud";
  return "Developer Tools & DevOps";
}

export function smartSwapSkillsSection(
  categories: SkillCategory[],
  tiers: LarpTierClassification,
  singleLineNcu = 98.0
): { updatedCategories: SkillCategory[]; changes: SkillSwapChange[] } {
  const cloned: SkillCategory[] = structuredClone(categories);
  const changes: SkillSwapChange[] = [];

  const matchedLower = new Set(tiers.matched.map((m) => m.toLowerCase()));
  const bannedLower = new Set(tiers.tier_2_banned.map((b) => b.toLowerCase()));

  for (const cat of cloned) {
    const bucket = matchCategoryBucket(cat.name);
    if (bucket === "Languages") continue;

    const origNames = cat.skills.map((s) => s.name);
    const origNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, origNames));

    const candidatesForCat = tiers.tier_1_5_skills_only.filter((skillName) => {
      if (bannedLower.has(skillName.toLowerCase())) return false;
      const catalogEntry = LARP_CATALOG.find(
        (c) => c.name.toLowerCase() === skillName.toLowerCase()
      );
      const targetBucket = catalogEntry?.targetSkillCategory ?? "Developer Tools & DevOps";
      if (
        cloned.length === 1 ||
        targetBucket === bucket ||
        (targetBucket === "Databases & Cloud" &&
          !cloned.some((c) => matchCategoryBucket(c.name) === "Databases & Cloud") &&
          bucket === "Developer Tools & DevOps")
      ) {
        return !cat.skills.some((s) => s.name.toLowerCase() === skillName.toLowerCase());
      }
      return false;
    });

    const added: string[] = [];
    const swappedOut: string[] = [];
    const workingSkills = [...cat.skills];

    for (const candidateSkill of candidatesForCat) {
      const testAppendNames = [...workingSkills.map((s) => s.name), candidateSkill];
      const testAppendNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, testAppendNames));

      if (testAppendNcu <= singleLineNcu) {
        workingSkills.push({ id: uid("s"), name: candidateSkill });
        added.push(candidateSkill);
        continue;
      }

      let swapIdx = -1;
      for (let i = workingSkills.length - 1; i >= 0; i--) {
        const existingName = workingSkills[i].name;
        const isMatchedInJd =
          matchedLower.has(existingName.toLowerCase()) ||
          splitItems(existingName).some((part) => matchedLower.has(part.toLowerCase()));
        if (!isMatchedInJd && !added.includes(existingName)) {
          swapIdx = i;
          break;
        }
      }

      if (swapIdx >= 0) {
        const copyNames = workingSkills.map((s) => s.name);
        const removedName = copyNames[swapIdx];
        copyNames[swapIdx] = candidateSkill;
        const testSwapNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, copyNames));
        if (testSwapNcu <= singleLineNcu) {
          swappedOut.push(removedName);
          added.push(candidateSkill);
          workingSkills[swapIdx] = { id: uid("s"), name: candidateSkill };
        }
      }
    }

    if (added.length > 0 || swappedOut.length > 0) {
      cat.skills = workingSkills;
      const newNcu = computeVisualWidth(
        formatCategoryLatexLine(cat.name, workingSkills.map((s) => s.name))
      );
      changes.push({
        categoryId: cat.id,
        categoryName: cat.name,
        added,
        swappedOut,
        origNcu,
        newNcu,
      });
    }
  }

  return { updatedCategories: cloned, changes };
}

/* ============================================================================
 * 6. STEP 3: CONTEXT-AWARE, CENTRALIZED MINIMAL BULLET INJECTION + LINE FIT
 * ============================================================================ */

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

export function classifyBulletContext(
  bulletMarkup: string,
  containerTitle: string
): BulletDomainContext {
  const combined = `${containerTitle} ${plainText(bulletMarkup)}`;

  if (
    /\b(?:CGEventTap|WH_KEYBOARD_LL|SymSpell|llama\.cpp|SmolLM2|Qt6|Win32|macOS desktop|ROS\s*2|LiDAR|Gazebo|Foxglove|Pure Pursuit|costmap|odometry|rover|sensor-fusion|Raft consensus|Write-Ahead Log)\b/i.test(
      combined
    )
  ) {
    return "systems-cpp-robotics";
  }

  if (
    /\b(?:React|Next\.js|dashboards?|UI|frontend|Tailwind|components|CSV\/Excel report)\b/i.test(
      combined
    )
  ) {
    return "frontend-ui";
  }

  if (
    /\b(?:deployed on|Firebase Cloud Functions|Docker|CI\/CD|GitHub Actions|serverless|container)\b/i.test(
      combined
    )
  ) {
    return "cloud-deploy-infra";
  }

  return "backend-api-db";
}

function tryMinimalKeywordInjection(
  origMarkup: string,
  context: BulletDomainContext,
  keyword: string
): { mutatedMarkup: string; reason: string; fitScore: number } | null {
  if (context === "systems-cpp-robotics") return null;
  if (containsPhrase(plainText(origMarkup), keyword)) return null;

  const trimmed = origMarkup.trim();

  if (keyword === "AWS") {
    if (/\bto \*\*Supabase\*\*\.$/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(/\bto \*\*Supabase\*\*\.$/i, "to **Supabase** on **AWS**."),
        reason: "Centralized cloud hosting context on backend API persistence",
        fitScore: 98,
      };
    }
    if (/\bdeployed on \*\*Firebase Cloud Functions\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bdeployed on \*\*Firebase Cloud Functions\*\*/i,
          "deployed on **AWS** and **Firebase**"
        ),
        reason: "Natural cloud deployment pairing on existing serverless agent bullet",
        fitScore: 95,
      };
    }
    if (/\bacross (\*\*\d+\*\*|\d+) internal services\.$/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
          "across $1 internal services on **AWS**."
        ),
        reason: "Lightweight cloud hosting context on internal backend services",
        fitScore: 92,
      };
    }
    if (context === "backend-api-db" || context === "cloud-deploy-infra") {
      if (/\busing \*\*React\*\* and \*\*REST APIs\*\*/i.test(trimmed)) {
        return {
          mutatedMarkup: trimmed.replace(
            /\busing \*\*React\*\* and \*\*REST APIs\*\*/i,
            "using **React**, **REST APIs**, and **AWS**"
          ),
          reason: "Appended AWS to existing stack list",
          fitScore: 88,
        };
      }
      if (
        /\b(?:APIs?|services?|pipeline|backend|server|PostgreSQL|FastAPI|Flask|Node\.js)\b/i.test(
          trimmed
        ) &&
        /\.$/.test(trimmed)
      ) {
        return {
          mutatedMarkup: trimmed.replace(/\.$/, " on **AWS**."),
          reason: "Appended lightweight AWS hosting context to backend bullet",
          fitScore: 84,
        };
      }
    }
  }

  if (keyword === "Redis") {
    if (/\bDeveloped \*\*REST APIs\*\* and relational \*\*PostgreSQL\*\* schemas to standardize eligibility records across (\*\*\d+\*\*|\d+) internal services\.$/i.test(trimmed)) {
      // Rewrite this 118-char orphan 2-liner so it fits cleanly inside the 1-line area (<= 108 chars) with Redis!
      return {
        mutatedMarkup: trimmed.replace(
          /\bDeveloped \*\*REST APIs\*\* and relational \*\*PostgreSQL\*\* schemas to standardize eligibility records across (\*\*\d+\*\*|\d+) internal services\.$/i,
          "Built **REST APIs**, **Redis** cache, and **PostgreSQL** schemas standardizing records across $1 services."
        ),
        reason: "Added Redis caching and tightened bullet to fit cleanly inside 1-line area",
        fitScore: 99,
      };
    }
    if (/\bacross (\*\*\d+\*\*|\d+) internal services\.$/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
          "across $1 internal services with **Redis** caching."
        ),
        reason: "Natural TTL/read-through caching addition on PostgreSQL + REST API bullet",
        fitScore: 97,
      };
    }
    if (/\brelational \*\*PostgreSQL\*\* schemas\b/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\brelational \*\*PostgreSQL\*\* schemas\b/i,
          "**PostgreSQL** schemas and **Redis** caching"
        ),
        reason: "Paired Redis caching alongside PostgreSQL schemas",
        fitScore: 94,
      };
    }
    if (/\bto \*\*Supabase\*\*\.$/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bto \*\*Supabase\*\*\.$/i,
          "to **Supabase** and **Redis**."
        ),
        reason: "Added Redis state store alongside Supabase persistence",
        fitScore: 89,
      };
    }
    if (context === "backend-api-db" && /\*\*PostgreSQL\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(/\*\*PostgreSQL\*\*/i, "**PostgreSQL** and **Redis**"),
        reason: "Paired Redis alongside PostgreSQL in backend bullet",
        fitScore: 85,
      };
    }
  }

  if (keyword === "GraphQL") {
    if (/\band \*\*REST APIs\*\*\.$/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\band \*\*REST APIs\*\*\.$/i,
          "**REST**, and **GraphQL APIs**."
        ),
        reason: "Minimal 2-word API query layer addition next to REST APIs",
        fitScore: 96,
      };
    }
    if (/\bDeveloped \*\*REST APIs\*\* and\b/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bDeveloped \*\*REST APIs\*\* and\b/i,
          "Built **REST/GraphQL APIs** and"
        ),
        reason: "Paired GraphQL with REST APIs in backend service bullet",
        fitScore: 94,
      };
    }
    if (/\bintegrating external \*\*REST APIs\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bintegrating external \*\*REST APIs\*\*/i,
          "integrating **REST** and **GraphQL APIs**"
        ),
        reason: "Replaced adjective 'external' with GraphQL alongside REST APIs",
        fitScore: 91,
      };
    }
    if (/\*\*REST APIs\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(/\*\*REST APIs\*\*/i, "**REST** and **GraphQL APIs**"),
        reason: "Paired GraphQL alongside REST APIs",
        fitScore: 86,
      };
    }
  }

  if (keyword === "Tailwind CSS") {
    if (context === "frontend-ui" && /\b\*\*TypeScript, Next\.js, React\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\b\*\*TypeScript, Next\.js, React\*\*/i,
          "**TypeScript, Next.js, React, Tailwind CSS**"
        ),
        reason: "Appended Tailwind CSS to existing Next.js/React frontend stack",
        fitScore: 95,
      };
    }
  }

  if (keyword === "Webhooks") {
    if (/\bhandled WhatsApp\/SMS via \*\*Twilio\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bhandled WhatsApp\/SMS via \*\*Twilio\*\*/i,
          "handled WhatsApp/SMS **Webhooks** via **Twilio**"
        ),
        reason: "Natural Twilio webhook event handling context",
        fitScore: 96,
      };
    }
    if (/\bvia \*\*Flask\*\* backend \*\*APIs\*\*/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bvia \*\*Flask\*\* backend \*\*APIs\*\*/i,
          "via **Flask** **Webhooks** and **APIs**"
        ),
        reason: "Added Webhooks to Flask event intake API bullet",
        fitScore: 92,
      };
    }
  }

  if (keyword === "Docker") {
    if (context === "cloud-deploy-infra" || context === "backend-api-db") {
      if (/\bacross (\*\*\d+\*\*|\d+) internal services\.$/i.test(trimmed)) {
        return {
          mutatedMarkup: trimmed.replace(
            /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
            "across $1 **Docker** services."
          ),
          reason: "Added Docker container context to internal services bullet",
          fitScore: 93,
        };
      }
    }
  }

  if (keyword === "Jira" || keyword === "Linear") {
    if (/\bGave clients control over call workflows and dispatch timing\b/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bGave clients control over call workflows and dispatch timing\b/i,
          `Gave clients control over **${keyword}**-tracked call workflows and dispatch timing`
        ),
        reason: `Centralized ${keyword} workflow mention on client dispatch & dashboard bullet`,
        fitScore: 95,
      };
    }
    if (/\bacross (\*\*\d+\*\*|\d+) internal services\.$/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(
          /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
          `across $1 internal services tracked in **${keyword}**.`
        ),
        reason: `Centralized ${keyword} sprint tracking on internal services bullet`,
        fitScore: 91,
      };
    }
    if (
      (context === "frontend-ui" || context === "backend-api-db") &&
      /\b(?:workflows?|features?|dashboards?|services?|sprints?)\b/i.test(trimmed) &&
      /\.$/.test(trimmed)
    ) {
      return {
        mutatedMarkup: trimmed.replace(/\.$/, `, tracked in **${keyword}**.`),
        reason: `Centralized ${keyword} mention on product/feature bullet`,
        fitScore: 86,
      };
    }
  }

  if (keyword === "Agile") {
    if (
      (context === "frontend-ui" || context === "backend-api-db") &&
      /\b(?:Developed|Built|Shipped)\b/i.test(trimmed) &&
      /\.$/.test(trimmed)
    ) {
      return {
        mutatedMarkup: trimmed.replace(/\.$/, " in **Agile** sprints."),
        reason: "Centralized Agile sprint mention on feature delivery bullet",
        fitScore: 85,
      };
    }
  }

  if (keyword === "end-to-end") {
    if (/^(?:Developed|Built)\s+(?!\*\*end-to-end\*\*)/i.test(trimmed)) {
      return {
        mutatedMarkup: trimmed.replace(/^(Developed|Built)\s+/i, "$1 **end-to-end** "),
        reason: "Centralized end-to-end ownership qualifier on a single feature bullet",
        fitScore: 88,
      };
    }
  }

  return null;
}

/* ============================================================================
 * 7. MALLEABLE 1-LINE LARP BULLET SYNTHESIZER + AI BELIEVABILITY EVALUATOR
 * ============================================================================ */

export interface MalleableBulletOption {
  id: string;
  styleLabel: "Casual & Direct" | "Simple Integration" | "Workflow & Ops";
  markup: string;
  latex: string;
  chars: number;
  maxChars: number;
  widthNcu: number;
  fit: ReturnType<typeof bulletFit>;
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
  fit: ReturnType<typeof bulletFit>;
  injectedKeywords: string[];
  roleContextSummary: string;
  believabilityScore: number;
  believabilityCritique: string;
  recommended: boolean;
  /** Multiple good, low-stretch 1-line resume bullet options for this slot so the user can pick their favorite phrasing. */
  options: MalleableBulletOption[];
}

export interface AiBelievabilityRecommendation {
  topPickId: string;
  topPickKind: "malleable-new-line" | "bullet-mutation";
  topPickTitle: string;
  believabilityScore: number;
  verdictSummary: string;
  whyMostBelievable: string;
  interviewTalkingPoint: string;
  rankings: {
    id: string;
    label: string;
    containerTitle: string;
    score: number;
    verdict: "Top Pick · Most Believable" | "Highly Defensible" | "Safe & Subtle";
    rationale: string;
  }[];
}

/**
 * Selects the single best role or project container on the resume where new 1-line
 * malleable LARP bullets belong most naturally (avoiding C++/OS/robotics roles and
 * preferring roles/projects with web, API, cloud, or backend stacks).
 */
function selectBestContainerForMalleableLines(resume: MasterResume): {
  id: string;
  title: string;
  kind: "experience" | "project";
  existingBullets: string[];
  techSignals: string[];
  roleSummary: string;
} | null {
  interface ContainerCandidate {
    id: string;
    title: string;
    kind: "experience" | "project";
    existingBullets: string[];
    techSignals: string[];
    roleSummary: string;
    score: number;
  }

  const candidates: ContainerCandidate[] = [];

  resume.experience.forEach((job, idx) => {
    const bulletsText = job.bullets.map((b) => plainText(b.text)).join(" ");
    const combined = `${job.title} ${job.company} ${bulletsText}`;
    const ctx = classifyBulletContext(bulletsText, `${job.title} ${job.company}`);
    if (ctx === "systems-cpp-robotics") return;

    const techSignals = job.bullets.flatMap((b) => b.tools);
    let score = 80;
    if (/\b(?:Full\s*Stack|Software|Backend|Platform|Web)\b/i.test(job.title)) score += 12;
    if (/\b(?:REST|PostgreSQL|React|Next\.js|Supabase|Python|TypeScript|FastAPI|Flask)\b/i.test(combined)) {
      score += 10;
    }
    // Slight preference for roles that aren't overcrowded (<= 3 bullets) or secondary experience
    if (job.bullets.length <= 3) score += 6;
    if (idx > 0) score += 5;

    candidates.push({
      id: job.id,
      title: `${job.title} · ${job.company}`,
      kind: "experience",
      existingBullets: job.bullets.map((b) => plainText(b.text)),
      techSignals: Array.from(new Set(techSignals)).slice(0, 6),
      roleSummary: `${job.title} at ${job.company} (${job.dates || "recent role"})`,
      score,
    });
  });

  for (const proj of resume.projects) {
    const bulletsText = proj.bullets.map((b) => plainText(b.text)).join(" ");
    const combined = `${proj.name} ${proj.techStack.join(" ")} ${bulletsText}`;
    const ctx = classifyBulletContext(bulletsText, `${proj.name} ${proj.techStack.join(" ")}`);
    if (ctx === "systems-cpp-robotics") continue;

    let score = 84;
    if (/\b(?:React|Next\.js|Python|TypeScript|Flask|Supabase|Firebase|Twilio|PostgreSQL|Docker)\b/i.test(combined)) {
      score += 11;
    }
    if (proj.bullets.length <= 3) score += 7;

    candidates.push({
      id: proj.id,
      title: `${proj.name} (Project)`,
      kind: "project",
      existingBullets: proj.bullets.map((b) => plainText(b.text)),
      techSignals: proj.techStack.slice(0, 6),
      roleSummary: `${proj.name} (${proj.techStack.slice(0, 4).join(", ")})`,
      score,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Generates up to `malleableCount` complete, context-aware 1-line LARP bullets
 * tailored to the chosen role/project and calibrated to fit inside the 1-line area (`<= oneLineMax`).
 */
export function synthesizeMalleableOneLineBullets(
  resume: MasterResume,
  tiers: LarpTierClassification,
  malleableCount: number
): MalleableSynthesizedBullet[] {
  const count = Math.max(0, Math.min(6, Math.round(malleableCount)));
  if (count === 0) return [];

  const target = selectBestContainerForMalleableLines(resume);
  if (!target) return [];

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMax = cal.oneLineMax || 108;
  const minOneLineChars = Math.ceil(oneLineMax * 0.82);

  // Extract domain nouns from existing bullets of that exact role/project so the new 1-line bullet reads like an authentic continuation
  const combinedExisting = target.existingBullets.join(" ");
  const hasVoiceOrDispatches = /\b(?:call|voice|dispatch|Twilio|WhatsApp|transcript|booking)\b/i.test(
    combinedExisting
  );
  const hasEligibilityOrRecords = /\b(?:eligibility|records|workflows|internal services|PostgreSQL)\b/i.test(
    combinedExisting
  );
  const primaryMatchedStack =
    target.techSignals.find((t) =>
      /^(?:TypeScript|Python|React|Next\.js|PostgreSQL|Supabase|Flask|FastAPI)$/i.test(t)
    ) ||
    tiers.matched[0] ||
    "TypeScript";

  const tier1 = tiers.tier_1_framing;
  const tier0 = tiers.tier_0_workflow;

  const hasRedis = tier1.some((k) => k.toLowerCase() === "redis");
  const hasGraphQL = tier1.some((k) => k.toLowerCase() === "graphql");
  const hasAws = tier1.some((k) => k.toLowerCase() === "aws");
  const hasWebhooks = tier1.some((k) => k.toLowerCase() === "webhooks");
  const hasDocker = tier1.some((k) => k.toLowerCase() === "docker");
  const pmTool = tier0.find((k) => /^(?:Jira|Linear|Agile)$/i.test(k)) || tier0[0];

  interface OptionTemplate {
    styleLabel: MalleableBulletOption["styleLabel"];
    variants: string[];
    easyExplanation: string;
  }

  interface TemplateOption {
    optionTemplates: OptionTemplate[];
    keywords: string[];
    believabilityScore: number;
    critique: string;
  }

  const candidateTemplates: TemplateOption[] = [];

  // Template 1: Simple, everyday API consumption or basic TTL caching (zero architectural stretch)
  if (hasGraphQL || hasRedis) {
    const kws = [
      ...(hasGraphQL ? ["GraphQL"] : []),
      ...(hasRedis ? ["Redis"] : []),
    ];
    if (hasEligibilityOrRecords) {
      candidateTemplates.push({
        optionTemplates: [
          {
            styleLabel: "Casual & Direct",
            variants: [
              `Used **${hasRedis ? "Redis" : primaryMatchedStack}** to cache repeat eligibility lookups and queried **${hasGraphQL ? "GraphQL" : "REST"}** endpoints across services.`,
              `Cached repeat eligibility lookups in **${hasRedis ? "Redis" : primaryMatchedStack}** and fetched record status via **${hasGraphQL ? "GraphQL" : "REST"}** queries.`,
            ],
            easyExplanation:
              "Super easy to explain: you just cached repeat database reads with a basic TTL key and fetched fields from an existing endpoint.",
          },
          {
            styleLabel: "Simple Integration",
            variants: [
              `Queried **${hasGraphQL ? "GraphQL" : "REST"}** endpoints and added **${hasRedis ? "Redis" : primaryMatchedStack}** caching to cut repeat database reads on records.`,
              `Connected **${hasGraphQL ? "GraphQL" : "REST"}** status queries with **${hasRedis ? "Redis" : primaryMatchedStack}** caching for internal eligibility checks.`,
            ],
            easyExplanation:
              "Frames GraphQL/Redis strictly as calling an endpoint and storing a key-value response—no complex server internals.",
          },
          {
            styleLabel: "Workflow & Ops",
            variants: [
              `Added **${hasRedis ? "Redis" : primaryMatchedStack}** response caching and **${hasGraphQL ? "GraphQL" : "REST"}** data fetching for internal service dashboards.`,
              `Wired up **${hasGraphQL ? "GraphQL" : "REST"}** queries and **${hasRedis ? "Redis" : primaryMatchedStack}** caching for internal eligibility tools.`,
            ],
            easyExplanation:
              "Positions the work as a straightforward internal tool improvement that nobody will grill you on.",
          },
        ],
        keywords: kws,
        believabilityScore: 96,
        critique:
          "Very low stretch: simply caching repeat lookups in Redis and querying an endpoint on top of your existing PostgreSQL service.",
      });
    } else if (hasVoiceOrDispatches) {
      candidateTemplates.push({
        optionTemplates: [
          {
            styleLabel: "Casual & Direct",
            variants: [
              `Cached active call state in **${hasRedis ? "Redis" : "Supabase"}** and queried **${hasGraphQL ? "GraphQL" : "REST"}** endpoints to update live dispatch views.`,
              `Used **${hasRedis ? "Redis" : "Supabase"}** to store short-lived call state and fetched updates via **${hasGraphQL ? "GraphQL" : "REST"}** queries.`,
            ],
            easyExplanation:
              "Just storing a temporary session key during a call and reading status for the UI.",
          },
          {
            styleLabel: "Simple Integration",
            variants: [
              `Fetched live dispatch status via **${hasGraphQL ? "GraphQL" : "REST"}** queries with **${hasRedis ? "Redis" : "Supabase"}** caching for recent call sessions.`,
            ],
            easyExplanation:
              "Simple client-side query + basic cache read.",
          },
          {
            styleLabel: "Workflow & Ops",
            variants: [
              `Added **${hasRedis ? "Redis" : "Supabase"}** session caching and **${hasGraphQL ? "GraphQL" : "REST"}** status checks for client call workflows.`,
            ],
            easyExplanation:
              "Easy everyday product feature framing.",
          },
        ],
        keywords: kws,
        believabilityScore: 95,
        critique:
          "Low-stretch addition: storing short-lived call state in Redis and reading status for the dashboard.",
      });
    } else {
      candidateTemplates.push({
        optionTemplates: [
          {
            styleLabel: "Casual & Direct",
            variants: [
              `Used **${hasRedis ? "Redis" : primaryMatchedStack}** to cache frequent API responses and queried **${hasGraphQL ? "GraphQL" : "REST"}** endpoints for UI views.`,
              `Queried **${hasGraphQL ? "GraphQL" : "REST"}** endpoints and cached frequent lookups in **${hasRedis ? "Redis" : primaryMatchedStack}** to reduce API load.`,
            ],
            easyExplanation:
              "Simple key-value response caching + standard data fetching.",
          },
          {
            styleLabel: "Simple Integration",
            variants: [
              `Connected **${hasGraphQL ? "GraphQL" : "REST"}** client queries with **${hasRedis ? "Redis" : primaryMatchedStack}** caching for faster page loads.`,
            ],
            easyExplanation:
              "Framed as basic consumption of an API and cache.",
          },
          {
            styleLabel: "Workflow & Ops",
            variants: [
              `Added **${hasRedis ? "Redis" : primaryMatchedStack}** TTL caching and **${hasGraphQL ? "GraphQL" : "REST"}** queries across internal app workflows.`,
            ],
            easyExplanation:
              "Lightweight, everyday engineering task.",
          },
        ],
        keywords: kws,
        believabilityScore: 94,
        critique:
          "Simple, everyday API consumption and TTL caching—no deep architecture claims.",
      });
    }
  }

  // Template 2: Simple Cloud Hosting / Webhooks / PM Tracking (zero-stretch)
  if (hasAws || hasWebhooks || hasDocker || pmTool) {
    const cloudKw = hasAws ? "AWS" : hasDocker ? "Docker" : "CI/CD";
    const secondKw = hasWebhooks ? "Webhooks" : pmTool || primaryMatchedStack;
    const kws = Array.from(
      new Set([
        ...(hasAws ? ["AWS"] : []),
        ...(hasDocker ? ["Docker"] : []),
        ...(hasWebhooks ? ["Webhooks"] : []),
        ...(pmTool ? [pmTool] : []),
      ])
    ).slice(0, 2);

    candidateTemplates.push({
      optionTemplates: [
        {
          styleLabel: "Casual & Direct",
          variants: [
            `Deployed **${primaryMatchedStack}** service updates on **${cloudKw}** and tracked sprint tasks and bug fixes in **${pmTool || "Git"}**.`,
            `Hosted **${primaryMatchedStack}** backend services on **${cloudKw}** and coordinated feature releases in **${pmTool || "Agile"}** sprints.`,
          ],
          easyExplanation:
            "Everyone pushes code to an existing cloud environment and moves tickets in Jira/Linear—zero technical risk.",
        },
        {
          styleLabel: "Simple Integration",
          variants: [
            `Wired up **${secondKw}** status notifications for **${primaryMatchedStack}** services running on **${cloudKw}**.`,
            `Configured **${cloudKw}** environment variables and **${secondKw}** callbacks for internal **${primaryMatchedStack}** APIs.`,
          ],
          easyExplanation:
            "Simple config and webhook callback handling that takes 15 minutes in real life.",
        },
        {
          styleLabel: "Workflow & Ops",
          variants: [
            `Managed **${pmTool || "Agile"}** sprint tickets and routine **${cloudKw}** deployments for internal **${primaryMatchedStack}** tools.`,
          ],
          easyExplanation:
            "Pure day-to-day workflow and routine deployment.",
        },
      ],
      keywords: kws.length > 0 ? kws : [cloudKw],
      believabilityScore: 95,
      critique:
        "Zero stretch: deploying your existing code to AWS/Docker and tracking sprint tickets in Jira/Linear is standard day-to-day work.",
    });
  }

  // Template 3: Simple testing / logging / sprint hygiene fallback
  candidateTemplates.push({
    optionTemplates: [
      {
        styleLabel: "Casual & Direct",
        variants: [
          `Wrote **${primaryMatchedStack}** API integration tests and tracked bug fixes across **${pmTool || "Agile"}** sprint cycles.`,
        ],
        easyExplanation:
          "Writing basic API tests and tracking tickets is 100% natural for any intern or junior engineer.",
      },
      {
        styleLabel: "Simple Integration",
        variants: [
          `Added structured **${primaryMatchedStack}** request logging and error alerts to simplify debugging across internal APIs.`,
        ],
        easyExplanation:
          "Simple logging and error handling in your main language.",
      },
    ],
    keywords: pmTool ? [pmTool, primaryMatchedStack] : [primaryMatchedStack],
    believabilityScore: 93,
    critique:
      "Completely grounded in your real language stack—just basic testing, logging, and sprint tracking.",
  });

  const results: MalleableSynthesizedBullet[] = [];

  for (let i = 0; i < Math.min(count, candidateTemplates.length); i++) {
    const tpl = candidateTemplates[i];
    const builtOptions: MalleableBulletOption[] = tpl.optionTemplates.map((optTpl, optIdx) => {
      let chosen = fitBulletToCalibratedLineArea(optTpl.variants[0], cal);
      for (const v of optTpl.variants) {
        const fitted = fitBulletToCalibratedLineArea(v, cal);
        const len = plainText(fitted).trim().length;
        if (len >= minOneLineChars && len <= oneLineMax) {
          chosen = fitted;
          break;
        }
        if (len <= oneLineMax) {
          chosen = fitted;
        }
      }
      const finalLen = plainText(chosen).trim().length;
      const latex = `\\item ${markupToLatex(chosen)}`;
      return {
        id: `malleable-${i + 1}-opt-${optIdx + 1}`,
        styleLabel: optTpl.styleLabel,
        markup: chosen,
        latex,
        chars: finalLen,
        maxChars: oneLineMax,
        widthNcu: computeVisualWidth(latex),
        fit: bulletFit(chosen, cal),
        easyExplanation: optTpl.easyExplanation,
      };
    });

    const primaryOpt = builtOptions[0];

    results.push({
      id: `malleable-${i + 1}`,
      targetContainerId: target.id,
      targetContainerTitle: target.title,
      targetContainerKind: target.kind,
      targetTechContext: target.techSignals,
      markup: primaryOpt.markup,
      latex: primaryOpt.latex,
      chars: primaryOpt.chars,
      maxChars: oneLineMax,
      widthNcu: primaryOpt.widthNcu,
      fit: primaryOpt.fit,
      injectedKeywords: tpl.keywords,
      roleContextSummary: target.roleSummary,
      believabilityScore: tpl.believabilityScore,
      believabilityCritique: tpl.critique,
      recommended: i === 0,
      options: builtOptions,
    });
  }

  return results;
}

/**
 * Evaluates all proposed changes (both synthesized 1-line malleable bullets and existing-bullet edits)
 * and produces a structured AI Believability Recommendation ranking which option is the most believable
 * and easiest to defend in a live interview.
 */
export function evaluateBelievabilityAndRecommend(
  malleableBullets: MalleableSynthesizedBullet[],
  bulletProposals: BulletMutationProposal[]
): AiBelievabilityRecommendation | null {
  const rankings: AiBelievabilityRecommendation["rankings"] = [];

  for (const bp of bulletProposals) {
    const kwLabel = bp.injectedKeywords.join(", ");
    const fitBonus = bp.budget.candFit.tone === "green" ? 4 : 1;
    // Prefer subtle 1-5 word edits to your existing real bullets as the easiest, least-stretched option
    const baseScore = Math.min(98, 93 + fitBonus + (bp.containerKind === "project" ? 1 : 1));
    rankings.push({
      id: bp.bulletId,
      label: `Subtle Edit (+${kwLabel})`,
      containerTitle: bp.containerTitle,
      score: baseScore,
      verdict: baseScore >= 96 ? "Top Pick · Most Believable" : "Highly Defensible",
      rationale: `Zero stretch: keeps 90%+ of your real bullet intact and just adds ${kwLabel} (${bp.budget.candChars}/${bp.budget.candLines === 1 ? 108 : 216} chars · ${bp.budget.candFit.badge}).`,
    });
  }

  for (const mb of malleableBullets) {
    rankings.push({
      id: mb.id,
      label: `New 1L Bullet (+${mb.injectedKeywords.join(", ")})`,
      containerTitle: mb.targetContainerTitle,
      score: Math.min(95, mb.believabilityScore),
      verdict: "Highly Defensible",
      rationale: `${mb.believabilityCritique} Includes ${mb.options.length} easy phrasing options to choose from.`,
    });
  }

  if (rankings.length === 0) return null;

  rankings.sort((a, b) => b.score - a.score);
  // Ensure only the #1 item carries the "Top Pick · Most Believable" badge
  rankings.forEach((r, idx) => {
    r.verdict =
      idx === 0
        ? "Top Pick · Most Believable"
        : r.score >= 92
        ? "Highly Defensible"
        : "Safe & Subtle";
  });

  const top = rankings[0];
  const isMalleableTop = malleableBullets.some((m) => m.id === top.id);
  const topKeywords = isMalleableTop
    ? malleableBullets.find((m) => m.id === top.id)?.injectedKeywords ?? []
    : bulletProposals.find((b) => b.bulletId === top.id)?.injectedKeywords ?? [];

  return {
    topPickId: top.id,
    topPickKind: isMalleableTop ? "malleable-new-line" : "bullet-mutation",
    topPickTitle: `${top.label} in ${top.containerTitle}`,
    believabilityScore: top.score,
    verdictSummary: `Easiest, Lowest-Stretch Pick: ${top.label} under ${top.containerTitle} (${top.score}% Believability)`,
    whyMostBelievable: top.rationale,
    interviewTalkingPoint:
      topKeywords.length > 0
        ? `Easy 1-sentence answer if asked: "We already had the main ${top.containerTitle.split("·")[0].trim()} service running, so I just used ${topKeywords.join(" and ")} for ${topKeywords.includes("Redis") ? "basic TTL caching on repeat reads" : topKeywords.includes("GraphQL") ? "fetching status fields for the UI" : topKeywords.includes("AWS") ? "hosting the service environment" : "day-to-day sprint & workflow tracking"}."`
        : `Grounded directly in the existing tech stack of ${top.containerTitle}.`,
    rankings,
  };
}

/* ============================================================================
 * 8. FULL LARP ALIGNMENT PIPELINE (CENTRALIZED + FITS 1L OR 2L AREA)
 * ============================================================================ */

export interface LarpAlignmentRun {
  tiers: LarpTierClassification;
  skillSwaps: SkillSwapChange[];
  updatedSkills: SkillCategory[];
  bulletProposals: BulletMutationProposal[];
  malleableBullets: MalleableSynthesizedBullet[];
  aiRecommendation: AiBelievabilityRecommendation | null;
  guardrailVerifiedZeroBanned: boolean;
}

export function runLarpAlignmentPipeline(
  jobDescription: string,
  resume: MasterResume
): LarpAlignmentRun {
  const tiers = classifyJobDescriptionTiers(jobDescription, resume);
  const { updatedCategories, changes: skillSwaps } = smartSwapSkillsSection(
    resume.skills,
    tiers,
    98.0
  );

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || 108;
  const twoLineMaxChars = cal.twoLineMax || 216;

  interface CandidateBulletSlot {
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

  const usedBulletIds = new Set<string>();
  const bulletProposals: BulletMutationProposal[] = [];
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const centralizedTargetKeywords = [
    ...tiers.tier_1_framing,
    ...tiers.tier_0_workflow.slice(0, 1),
  ];

  for (const keyword of centralizedTargetKeywords) {
    let bestProposal: {
      slot: CandidateBulletSlot;
      mutatedMarkup: string;
      reason: string;
      score: number;
      budget: LineBudgetCheck;
      wordStats: WordReframeStats;
    } | null = null;

    for (const slot of slots) {
      if (usedBulletIds.has(slot.bullet.id)) continue;

      const attempt = tryMinimalKeywordInjection(slot.bullet.text, slot.context, keyword);
      if (!attempt) continue;

      // Automatically rewrite/tighten the modified bullet so it fits cleanly inside the calibrated 1-line or 2-line area!
      const fittedMarkup = fitBulletToCalibratedLineArea(attempt.mutatedMarkup, cal);

      // Verify zero Tier 2 Banned terms
      if (bannedLower.some((b) => containsPhrase(plainText(fittedMarkup), b))) continue;

      const budget = checkLineBudget(slot.bullet.text, fittedMarkup, cal, 98.0);
      if (!budget.valid) continue;

      const wordStats = computeWordReframeStats(slot.bullet.text, fittedMarkup, 7);
      if (!wordStats.withinCap) continue;

      // Bonus score if the fitted bullet lands in the Green ideal 1-line or 2-line zone
      const greenBonus = budget.candFit.tone === "green" ? 12 : 0;
      const totalScore =
        attempt.fitScore + slot.defensibilityBonus + greenBonus + Math.min(8, slot.charSlack / 6);

      if (!bestProposal || totalScore > bestProposal.score) {
        bestProposal = {
          slot,
          mutatedMarkup: fittedMarkup,
          reason: attempt.reason,
          score: totalScore,
          budget,
          wordStats,
        };
      }
    }

    if (bestProposal) {
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

  const malleableCount = cal.malleableLines ?? 1;
  const malleableBullets = synthesizeMalleableOneLineBullets(resume, tiers, malleableCount);
  const aiRecommendation = evaluateBelievabilityAndRecommend(malleableBullets, bulletProposals);

  const allMutatedText = [
    ...updatedCategories.flatMap((c) => c.skills.map((s) => s.name)),
    ...bulletProposals.map((p) => plainText(p.mutatedMarkup)),
    ...malleableBullets.map((m) => plainText(m.markup)),
  ].join(" ");

  const guardrailVerifiedZeroBanned = !bannedLower.some((b) =>
    containsPhrase(allMutatedText, b)
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

export function applyLarpMutationsToResume(
  resume: MasterResume,
  alignment: LarpAlignmentRun,
  acceptedBulletIds: Set<string>,
  applySkills = true,
  acceptedMalleableIds?: Set<string>,
  selectedMalleableOptionBySlotId?: Record<string, string>
): MasterResume {
  const next: MasterResume = structuredClone(resume);
  if (applySkills) {
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

export const PYLON_TEST_JD = `Pylon — Software Engineer (Full-Stack / B2B Support Platform)
We are building the modern B2B customer support and account intelligence platform.
Requirements & Tech Stack:
- Strong experience with React, TypeScript, Python, PostgreSQL, and REST APIs.
- Experience with Golang (Go) and Rust for high-throughput backend services.
- Experience querying GraphQL APIs, caching with Redis, and deploying on AWS (EC2, S3, Lambda).
- Comfortable with Agile workflows and tracking issues in Jira.`;
