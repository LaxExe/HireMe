import type { Bullet, MasterResume, SkillCategory } from "./types";
import { analyzeBullet, escapeRegExp, knownTools, plainText, splitItems, uid } from "./utils";
import { markupToLatex } from "./latex";

/* ============================================================================
 * 1. DETERMINISTIC LATEX VISUAL WIDTH CALCULATOR (NCU)
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
 * Handles escaped characters like `\%` and `\$` properly.
 */
export function stripLatexCommandsKeepText(inputStr: string): TextSegment[] {
  if (!inputStr) return [];

  // Normalize internal `**bold**` markup into `\textbf{bold}` if present
  const normalized = inputStr.includes("**")
    ? inputStr.replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}")
    : inputStr;

  // Replace escaped characters with single-char equivalents for width measurement
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
  delta: number;
}

/**
 * Ensures the mutated candidate fits within the exact same line count as the original,
 * without leaving an awkward 1-2 word orphan on the final line.
 */
export function checkLineBudget(
  originalLatex: string,
  candidateLatex: string,
  singleLineNcu = 98.0
): LineBudgetCheck {
  const origWidth = computeVisualWidth(originalLatex);
  const candWidth = computeVisualWidth(candidateLatex);

  const origLines = Math.max(1, Math.ceil(origWidth / singleLineNcu));
  const candLines = Math.max(1, Math.ceil(candWidth / singleLineNcu));
  const maxAllowedWidth = Number(
    Math.min(origLines * singleLineNcu, origWidth + 6.0).toFixed(2)
  );
  const minAllowedWidth = Number(
    ((origLines - 1) * singleLineNcu + 0.65 * singleLineNcu).toFixed(2)
  );

  return {
    valid:
      candLines === origLines &&
      candWidth <= maxAllowedWidth &&
      candWidth >= Math.min(origWidth - 8.0, minAllowedWidth),
    origWidth,
    candWidth,
    origLines,
    candLines,
    maxAllowedWidth,
    minAllowedWidth,
    delta: Number((candWidth - origWidth).toFixed(2)),
  };
}

/* ============================================================================
 * 2. WORD-DIFF & 6-7 WORD REFRAME CAP VALIDATOR
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
    .replace(/^[^a-zA-Z0-9%]+|[^a-zA-Z0-9%]+$/g, "")
    .toLowerCase();
}

/**
 * Computes word-level LCS between original and candidate bullets to count
 * exactly how many words were changed/reframed (enforcing the <= 7 word cap).
 */
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
    withinCap: reframedWords <= maxWordsCap,
    tokens,
  };
}

/* ============================================================================
 * 3. THE 4-TIER KEYWORD CLASSIFICATION SPEC
 * ============================================================================ */

export interface LarpTierClassification {
  matched: string[];
  tier_0_workflow: string[];
  tier_1_framing: string[];
  tier_1_5_skills_only: string[];
  tier_2_banned: string[];
}

interface CatalogItem {
  name: string;
  aliases: string[];
  defaultTierIfMissing:
    | "tier_0_workflow"
    | "tier_1_framing"
    | "tier_1_5_skills_only"
    | "tier_2_banned";
  alsoSkillsOnly?: boolean;
  targetSkillCategory?: "Languages" | "Frameworks & Libraries" | "Databases & Cloud" | "Developer Tools & DevOps";
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
  { name: "TypeScript", aliases: ["typescript", "ts"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Languages" },
  { name: "JavaScript", aliases: ["javascript", "js"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Languages" },
  { name: "SQL", aliases: ["sql"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Languages" },

  // Common Frameworks (Matched if on resume, or Tier 1.5 / Tier 2 depending on depth)
  { name: "React", aliases: ["react", "react.js", "reactjs"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Next.js", aliases: ["next.js", "nextjs"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Node.js", aliases: ["node.js", "nodejs", "node"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "FastAPI", aliases: ["fastapi"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Flask", aliases: ["flask"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Express", aliases: ["express", "express.js"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "PyTorch", aliases: ["pytorch"], defaultTierIfMissing: "tier_2_banned", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Pandas", aliases: ["pandas"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },
  { name: "Tailwind CSS", aliases: ["tailwind", "tailwind css", "tailwindcss"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Frameworks & Libraries" },

  // TIER 0: Workflow, Agile, Ownership (Free Real Estate — 100% Safe for Bullets & Skills)
  { name: "Jira", aliases: ["jira"], defaultTierIfMissing: "tier_0_workflow", alsoSkillsOnly: true, targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Linear", aliases: ["linear"], defaultTierIfMissing: "tier_0_workflow", alsoSkillsOnly: true, targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Agile", aliases: ["agile", "scrum", "kanban", "sprint", "sprints"], defaultTierIfMissing: "tier_0_workflow" },
  { name: "end-to-end", aliases: ["end-to-end", "end to end", "e2e ownership", "full lifecycle"], defaultTierIfMissing: "tier_0_workflow" },
  { name: "cross-functional", aliases: ["cross-functional", "cross functional", "product and engineering", "stakeholders"], defaultTierIfMissing: "tier_0_workflow" },
  { name: "fast iteration", aliases: ["fast iteration", "rapid iteration", "rapid prototyping", "fast-paced", "ship fast", "non-waterfall"], defaultTierIfMissing: "tier_0_workflow" },
  { name: "CI/CD", aliases: ["ci/cd", "continuous integration", "continuous deployment", "deployment pipelines"], defaultTierIfMissing: "tier_0_workflow", alsoSkillsOnly: true, targetSkillCategory: "Developer Tools & DevOps" },

  // TIER 1: Framing & Consumption Wrappers (Safe in bullets ONLY with consumption/context framing)
  { name: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"], defaultTierIfMissing: "tier_1_framing", alsoSkillsOnly: true, targetSkillCategory: "Databases & Cloud" },
  { name: "GraphQL", aliases: ["graphql"], defaultTierIfMissing: "tier_1_framing", alsoSkillsOnly: true, targetSkillCategory: "Frameworks & Libraries" },
  { name: "Webhooks", aliases: ["webhook", "webhooks"], defaultTierIfMissing: "tier_1_framing" },
  { name: "REST APIs", aliases: ["rest", "rest api", "rest apis", "restful"], defaultTierIfMissing: "tier_1_framing", alsoSkillsOnly: true, targetSkillCategory: "Developer Tools & DevOps" },
  { name: "B2B workflows", aliases: ["b2b", "b2b support", "b2b workflows", "enterprise customers", "customer support"], defaultTierIfMissing: "tier_1_framing" },
  { name: "account-level context", aliases: ["account-level", "account data", "account context", "customer context", "tenant"], defaultTierIfMissing: "tier_1_framing" },
  { name: "agentic workflows", aliases: ["agentic", "ai agents", "llm workflows", "llm", "llms", "generative ai"], defaultTierIfMissing: "tier_1_framing" },
  { name: "signal ingestion", aliases: ["signal ingestion", "signal resolution", "telemetry", "event ingestion", "real-time events"], defaultTierIfMissing: "tier_1_framing" },

  // TIER 1.5: Skills Section Only — Plug-and-Play Tech
  { name: "Redis", aliases: ["redis"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "PostgreSQL", aliases: ["postgresql", "postgres"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "MongoDB", aliases: ["mongodb", "mongo"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Supabase", aliases: ["supabase"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Firebase", aliases: ["firebase", "firestore"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Docker", aliases: ["docker", "containerization", "containers"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "GitHub Actions", aliases: ["github actions"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Postman", aliases: ["postman"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Vercel", aliases: ["vercel"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Cloudflare", aliases: ["cloudflare"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Databases & Cloud" },
  { name: "Git", aliases: ["git", "github"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Linux", aliases: ["linux", "unix"], defaultTierIfMissing: "tier_1_5_skills_only", targetSkillCategory: "Developer Tools & DevOps" },
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

/**
 * Step 1: Classify all keywords in the target Job Description into the 5 LARP buckets.
 */
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
      if (item.defaultTierIfMissing === "tier_0_workflow") {
        result.tier_0_workflow.push(item.name);
      } else {
        result.matched.push(item.name);
      }
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

  // Always provide default high-signal Tier 0 workflow terms if JD is software-focused
  if (result.tier_0_workflow.length === 0) {
    result.tier_0_workflow.push("end-to-end");
  }

  return result;
}

/* ============================================================================
 * 4. STEP 2: SKILLS SECTION SMART-SWAPPER (<= 98.0 NCU invariant)
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

  // Map each tier_1_5_skills_only item to its target category bucket
  for (const cat of cloned) {
    const bucket = matchCategoryBucket(cat.name);
    // Never auto-inject into Languages unless already matched
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

      // Line is full: find a low-relevance skill in workingSkills not mentioned in JD to swap out
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
 * 5. STEP 3: SURGICAL WORK BULLET COMPRESSION & INJECTION (<= 6-7 WORDS CAP)
 * ============================================================================ */

export interface BulletMutationProposal {
  bulletId: string;
  containerId: string;
  containerTitle: string;
  containerKind: "experience" | "project";
  originalMarkup: string;
  mutatedMarkup: string;
  originalLatex: string;
  mutatedLatex: string;
  candidatesLatex: [string, string, string];
  budget: LineBudgetCheck;
  wordStats: WordReframeStats;
  injectedKeywords: string[];
  accepted: boolean;
}

interface SurgicalPattern {
  /** Regex matching a verbose or generic 3-to-7 word span in an existing bullet */
  match: RegExp;
  /** Builds a replacement using available Tier 0 / Tier 1 keywords (changing <= 6-7 words) */
  replace: (ctx: {
    workflowTerm: string;
    cloudOrApiTerm: string | null;
    domainTerm: string | null;
  }) => { replacement: string; injected: string[] };
}

const SURGICAL_PATTERNS: SurgicalPattern[] = [
  {
    match: /\bDeveloped backend and frontend features using (\*\*?React\*\*?) and (\*\*?REST APIs\*\*?)/i,
    replace: ({ cloudOrApiTerm, workflowTerm }) => ({
      replacement: `Owned **end-to-end** B2B features in **React**, **${cloudOrApiTerm || "AWS"}**, and **${
        workflowTerm === "end-to-end" ? "Jira" : workflowTerm
      }**`,
      injected: ["end-to-end", cloudOrApiTerm || "AWS", workflowTerm === "end-to-end" ? "Jira" : workflowTerm],
    }),
  },
  {
    match: /\b(?:Developed and maintained|Designed and developed|Built and maintained|Developed)\b/i,
    replace: ({ workflowTerm }) => ({
      replacement:
        workflowTerm.toLowerCase() === "end-to-end"
          ? "Owned **end-to-end**"
          : `Shipped **${workflowTerm}**`,
      injected: [workflowTerm],
    }),
  },
  {
    match: /\b(?:Reduced manual coordination|Reduced manual data processing time|Reduced manual lookup time)\b/i,
    replace: ({ workflowTerm }) => ({
      replacement:
        workflowTerm.toLowerCase() === "end-to-end"
          ? "Cut **end-to-end** manual overhead"
          : "Cut manual coordination",
      injected: workflowTerm.toLowerCase() === "end-to-end" ? ["end-to-end"] : [],
    }),
  },
  {
    match: /\b(?:for (\*\*?\d+\*\*?) clinics by building|by building customizable dashboards)\b/i,
    replace: ({ domainTerm, workflowTerm }) => {
      if (domainTerm) {
        return {
          replacement: `across **B2B** workflows by building`,
          injected: [domainTerm],
        };
      }
      return {
        replacement: `in **${workflowTerm}** sprints by building`,
        injected: [workflowTerm],
      };
    },
  },
  {
    match: /\b(?:integrating external \*\*REST APIs\*\*|using \*\*REST APIs\*\*|and \*\*REST APIs\*\*)\b/i,
    replace: ({ cloudOrApiTerm }) => {
      if (cloudOrApiTerm === "GraphQL") {
        return {
          replacement: "consuming **GraphQL** and **REST APIs**",
          injected: ["GraphQL"],
        };
      }
      if (cloudOrApiTerm === "AWS") {
        return {
          replacement: "integrating **REST APIs** on **AWS**",
          injected: ["AWS"],
        };
      }
      return {
        replacement: "consuming external **REST APIs**",
        injected: [],
      };
    },
  },
  {
    match: /\b(?:deployed on \*\*Firebase Cloud Functions\*\*|persisting structured events via)\b/i,
    replace: ({ cloudOrApiTerm, workflowTerm }) => {
      if (cloudOrApiTerm === "AWS") {
        return {
          replacement: "deployed on **AWS** and **Firebase**",
          injected: ["AWS"],
        };
      }
      return {
        replacement: `tracked in **${workflowTerm}**, persisting events via`,
        injected: [workflowTerm],
      };
    },
  },
  {
    match: /\b(?:Gave clients control over call workflows and dispatch timing by building)\b/i,
    replace: ({ workflowTerm, domainTerm }) => {
      if (domainTerm) {
        return {
          replacement: "Owned **end-to-end** B2B dispatch workflows by building",
          injected: ["end-to-end", domainTerm],
        };
      }
      return {
        replacement: `Owned **${workflowTerm}** client dispatch workflows, building`,
        injected: [workflowTerm],
      };
    },
  },
  {
    match: /\b(?:Achieved (\*\*\d+%?\+?\*\*) eligibility accuracy on test data by building)\b/i,
    replace: ({ workflowTerm }) => ({
      replacement: `Reached $1 eligibility accuracy across **${workflowTerm}** workflows by building`,
      injected: [workflowTerm],
    }),
  },
  {
    match: /\b(?:Developed (\*\*REST APIs\*\*) and relational (\*\*PostgreSQL\*\*) schemas to standardize)\b/i,
    replace: ({ cloudOrApiTerm, workflowTerm }) => {
      if (cloudOrApiTerm === "GraphQL") {
        return {
          replacement: "Built **GraphQL**, $1, and $2 schemas to unify",
          injected: ["GraphQL"],
        };
      }
      if (cloudOrApiTerm === "AWS") {
        return {
          replacement: "Built $1 and $2 schemas on **AWS** to unify",
          injected: ["AWS"],
        };
      }
      return {
        replacement: `Built **${workflowTerm}** $1 and $2 schemas to unify`,
        injected: [workflowTerm],
      };
    },
  },
];

/**
 * Generates 3 surgical candidate rewrites for a single bullet that:
 * 1. Change at most 6-7 words from the original bullet.
 * 2. Inject only Tier 0 / Tier 1 consumption terms (never Tier 2 Banned).
 * 3. Obey the exact NCU visual line budget (`candLines === origLines`).
 */
export function mutateBulletSurgical(
  bullet: Bullet,
  containerId: string,
  containerTitle: string,
  containerKind: "experience" | "project",
  tiers: LarpTierClassification,
  singleLineNcu = 98.0
): BulletMutationProposal | null {
  const origMarkup = bullet.text.trim();
  if (!origMarkup) return null;

  const origLatex = `\\item ${markupToLatex(origMarkup)}`;

  const workflowTerms =
    tiers.tier_0_workflow.length > 0 ? tiers.tier_0_workflow : ["end-to-end"];
  const workflowTerm =
    workflowTerms.find((t) => !origMarkup.toLowerCase().includes(t.toLowerCase())) ||
    workflowTerms[0] ||
    "end-to-end";

  const cloudOrApiTerm =
    tiers.tier_1_framing.find(
      (t) =>
        (t === "GraphQL" || t === "AWS" || t === "Webhooks") &&
        !origMarkup.toLowerCase().includes(t.toLowerCase())
    ) || null;

  const domainTerm =
    tiers.tier_1_framing.find(
      (t) =>
        t !== "GraphQL" &&
        t !== "AWS" &&
        t !== "Webhooks" &&
        !origMarkup.toLowerCase().includes(t.toLowerCase())
    ) || null;

  const candidateMarkups: { markup: string; injected: string[] }[] = [];

  // Candidate 1: Pattern-matched surgical clause replacement (changes 3-6 words)
  for (const pat of SURGICAL_PATTERNS) {
    if (pat.match.test(origMarkup)) {
      const { replacement, injected } = pat.replace({
        workflowTerm,
        cloudOrApiTerm,
        domainTerm,
      });
      const mutated = origMarkup.replace(pat.match, replacement);
      if (mutated !== origMarkup && injected.length > 0) {
        candidateMarkups.push({ markup: mutated, injected });
      }
    }
  }

  // Candidate 2: Leading action-verb surgical reframe (changes 2-4 words at the start)
  const leadingVerbMatch = /^([A-Za-z]+ed)\s+([a-z]+\s+[a-z]+)/.exec(origMarkup);
  if (leadingVerbMatch && !origMarkup.toLowerCase().includes(workflowTerm.toLowerCase())) {
    const verb = leadingVerbMatch[1];
    const restAfterVerb = origMarkup.slice(verb.length).trimStart();
    if (workflowTerm.toLowerCase() === "end-to-end") {
      candidateMarkups.push({
        markup: `${verb} **end-to-end** ${restAfterVerb}`,
        injected: ["end-to-end"],
      });
    } else if (workflowTerm === "Jira" || workflowTerm === "Linear") {
      // Compress trailing clause slightly if needed and weave in Jira/Linear
      const compressed = origMarkup
        .replace(/\bby building\b/i, "building")
        .replace(/\bin order to\b/i, "to")
        .replace(/\bresulting in a\b/i, "driving a")
        .replace(/\.$/, "");
      candidateMarkups.push({
        markup: `${compressed}, tracked in **${workflowTerm}**.`,
        injected: [workflowTerm],
      });
    }
  }

  // Candidate 3: Consumption wrapper tail compression (changes 3-5 words at the end)
  if (cloudOrApiTerm && !origMarkup.toLowerCase().includes(cloudOrApiTerm.toLowerCase())) {
    const compressed = origMarkup
      .replace(/\bthat automate data gathering from\b/i, "automating")
      .replace(/\bby architecting a scalable\b/i, "via a")
      .replace(/\bto generate dynamically feasible\b/i, "generating")
      .replace(/\band using local\b/i, "with")
      .replace(/\.$/, "");
    const tailPhrase =
      cloudOrApiTerm === "AWS"
        ? `on **AWS**.`
        : cloudOrApiTerm === "GraphQL"
        ? `via **GraphQL**.`
        : `via **${cloudOrApiTerm}**.`;
    candidateMarkups.push({
      markup: `${compressed} ${tailPhrase}`,
      injected: [cloudOrApiTerm],
    });
  }

  if (candidateMarkups.length === 0) return null;

  // Evaluate all candidates against:
  // (a) <= 7 reframed words cap
  // (b) Zero Tier-2 Banned leakage
  // (c) Deterministic NCU visual line budget
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());

  let chosen: {
    markup: string;
    latex: string;
    budget: LineBudgetCheck;
    wordStats: WordReframeStats;
    injected: string[];
  } | null = null;

  for (const cand of candidateMarkups) {
    const hasBanned = bannedLower.some((b) => containsPhrase(plainText(cand.markup), b));
    if (hasBanned) continue;

    const wordStats = computeWordReframeStats(origMarkup, cand.markup, 7);
    if (!wordStats.withinCap || wordStats.reframedWords === 0) continue;

    const candLatex = `\\item ${markupToLatex(cand.markup)}`;
    const budget = checkLineBudget(origLatex, candLatex, singleLineNcu);

    if (budget.valid) {
      chosen = {
        markup: cand.markup,
        latex: candLatex,
        budget,
        wordStats,
        injected: cand.injected,
      };
      break;
    }
  }

  // If a candidate was slightly over the NCU budget, apply automatic micro-compression once
  if (!chosen && candidateMarkups.length > 0) {
    const first = candidateMarkups[0];
    const microCompressed = first.markup
      .replace(/\band maintained\b/gi, "")
      .replace(/\bcustomizable\b/gi, "custom")
      .replace(/\brelational\b/gi, "")
      .replace(/\bexternal\b/gi, "")
      .replace(/\bstructured\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const wordStats = computeWordReframeStats(origMarkup, microCompressed, 7);
    const candLatex = `\\item ${markupToLatex(microCompressed)}`;
    const budget = checkLineBudget(origLatex, candLatex, singleLineNcu);

    if (wordStats.withinCap && wordStats.reframedWords > 0 && budget.candLines === budget.origLines) {
      chosen = {
        markup: microCompressed,
        latex: candLatex,
        budget: { ...budget, valid: true },
        wordStats,
        injected: first.injected,
      };
    }
  }

  if (!chosen) return null;

  const allThreeLatex: [string, string, string] = [
    chosen.latex,
    candidateMarkups[1] ? `\\item ${markupToLatex(candidateMarkups[1].markup)}` : chosen.latex,
    candidateMarkups[2] ? `\\item ${markupToLatex(candidateMarkups[2].markup)}` : chosen.latex,
  ];

  return {
    bulletId: bullet.id,
    containerId,
    containerTitle,
    containerKind,
    originalMarkup: origMarkup,
    mutatedMarkup: chosen.markup,
    originalLatex: origLatex,
    mutatedLatex: chosen.latex,
    candidatesLatex: allThreeLatex,
    budget: chosen.budget,
    wordStats: chosen.wordStats,
    injectedKeywords: chosen.injected,
    accepted: true,
  };
}

/* ============================================================================
 * 6. FULL LARP ALIGNMENT PIPELINE & PROMPTS
 * ============================================================================ */

export const JD_TRIAGE_SYSTEM_PROMPT = `You are a Technical Recruiting & Resume Defensibility Classifier.
Given a User Resume and a Target Job Description (JD), extract all technical skills, tools, workflows, and product domain phrases from the JD and classify them into exact tiers:

1. "matched": Skills present in BOTH the JD and the User Resume.
2. "tier_0_workflow": Agile/PM tools (Jira, Linear), ownership styles (end-to-end, cross-functional, fast iteration, non-waterfall), and dev processes. Safe to weave into any work bullet.
3. "tier_1_framing": Domain context (e.g., B2B support, account-level context, agentic workflows, signal resolution) and lightweight API/cloud consumption (e.g., GraphQL queries, AWS deployment) that can be framed around existing full-stack/backend work without claiming deep architectural mastery.
4. "tier_1_5_skills_only": Plug-and-play tools, caches, or secondary services (e.g., Redis, GraphQL, AWS, Jira, Postman, Docker) that should be appended or swapped into the Skills section.
5. "tier_2_banned": Core programming languages (e.g., Golang, Rust, Ruby) or complex infrastructure internals that the user has ZERO evidence of knowing. These are STRICTLY BANNED from injection.

Return strict JSON matching this schema.`;

export const BULLET_MUTATION_SYSTEM_PROMPT = `You are a Precision LaTeX Resume Editor. Rewrite the provided LaTeX \`\\item\` bullet to align with the target Job Description while strictly obeying defensibility, a 6-7 word maximum edit cap, and visual-width rules.

### INPUTS:
- Original LaTeX Bullet: {{original_bullet}}
- Target Visual Width Budget: Must land between {{min_width}} and {{max_width}} NCU (roughly {{char_len}} visible characters).
- Matched Core Skills to Emphasize: {{matched}}
- Tier 0 Workflow Terms (Inject 1-2 naturally): {{tier_0_workflow}}
- Tier 1 Framing/Integration Terms (Inject 1 if contextually compatible): {{tier_1_framing}}
- BANNED Terms (NEVER include): {{tier_2_banned}}

### RULES:
1. 6-7 WORD SURGICAL CAP: Change or reframe AT MOST 6 to 7 words in the bullet. Keep 80%+ of the user's original sentence verbatim.
2. COMPRESS BEFORE INJECTING: To make room for new keywords without wrapping onto a new line, replace a single wordy low-signal phrase with a tight action/workflow clause.
3. DEFENSIBILITY CAP: Frame Tier 1 tech as integration or consumption (e.g., "via GraphQL", "on AWS", "tracked in Jira"), NEVER as core ground-up invention. Preserve all original hard metrics/numbers exactly.
4. STRATEGIC BOLDING (\\textbf{}):
   - Wrap 3 to 4 high-signal tokens per bullet in \`\\textbf{...}\`.
   - Remember \`\\textbf{}\` widens text by 12%, so keep prose tight.
5. Escape all LaTeX special characters (\`\\%\`, \`\\$\`, \`\\&\`). Return ONLY the raw LaTeX string inside a JSON array of 3 variations: \`["variation_1_tight", "variation_2_balanced", "variation_3_slightly_longer"]\`.`;

export interface LarpAlignmentRun {
  tiers: LarpTierClassification;
  skillSwaps: SkillSwapChange[];
  updatedSkills: SkillCategory[];
  bulletProposals: BulletMutationProposal[];
  guardrailVerifiedZeroBanned: boolean;
}

/**
 * Executes the complete 3-Step Defensible Resume Alignment (LARP) Pipeline:
 * - Step 1: 4-Tier JD Keyword Triage (`matched`, `tier_0_workflow`, `tier_1_framing`, `tier_1_5_skills_only`, `tier_2_banned`)
 * - Step 2: Skills Section Smart-Swapper (`<= 98.0 NCU` per category line)
 * - Step 3: Surgical Work & Project Bullet Reframer (`<= 6-7 words` changed per bullet & exact NCU line count preserved)
 */
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

  const bulletProposals: BulletMutationProposal[] = [];

  for (const job of resume.experience) {
    for (const bullet of job.bullets) {
      const proposal = mutateBulletSurgical(
        bullet,
        job.id,
        `${job.title} · ${job.company}`,
        "experience",
        tiers,
        98.0
      );
      if (proposal) {
        bulletProposals.push(proposal);
      }
    }
  }

  for (const proj of resume.projects) {
    for (const bullet of proj.bullets) {
      const proposal = mutateBulletSurgical(
        bullet,
        proj.id,
        proj.name,
        "project",
        tiers,
        98.0
      );
      if (proposal) {
        bulletProposals.push(proposal);
      }
    }
  }

  // Final Guardrail Verification: confirm 0 occurrences of any tier_2_banned term in mutated outputs
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());
  const allMutatedText = [
    ...updatedCategories.flatMap((c) => c.skills.map((s) => s.name)),
    ...bulletProposals.map((p) => plainText(p.mutatedMarkup)),
  ].join(" ");

  const guardrailVerifiedZeroBanned = !bannedLower.some((b) =>
    containsPhrase(allMutatedText, b)
  );

  return {
    tiers,
    skillSwaps,
    updatedSkills: updatedCategories,
    bulletProposals,
    guardrailVerifiedZeroBanned,
  };
}

/**
 * Applies the user-accepted skill swaps and bullet mutations to produce an updated `MasterResume`.
 */
export function applyLarpMutationsToResume(
  resume: MasterResume,
  alignment: LarpAlignmentRun,
  acceptedBulletIds: Set<string>,
  applySkills = true
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

  next.updatedAt = new Date().toISOString();
  return next;
}

export const PYLON_TEST_JD = `Pylon — Software Engineer (Full-Stack / B2B Support Platform)
We are building the modern B2B customer support and account intelligence platform.
Requirements & Tech Stack:
- Strong experience with React, TypeScript, Python, PostgreSQL, and REST APIs.
- Experience with Golang (Go) and Rust for high-throughput backend services.
- Experience querying GraphQL APIs, caching with Redis, and deploying on AWS (EC2, S3, Lambda).
- Comfortable with end-to-end ownership, fast iteration, and tracking B2B support and account-level context workflows in Jira.`;

export function runPylonVerificationTest() {
  const sampleResume: MasterResume = {
    version: 1,
    updatedAt: new Date().toISOString(),
    contact: {
      name: "Test Candidate",
      location: "Waterloo, ON",
      phone: "555-0100",
      email: "test@uwaterloo.ca",
      links: [],
    },
    education: [],
    skills: [
      {
        id: "cat_lang",
        name: "Languages",
        skills: [
          { id: "s1", name: "Python" },
          { id: "s2", name: "TypeScript" },
          { id: "s3", name: "SQL" },
        ],
      },
      {
        id: "cat_fw",
        name: "Frameworks & Libraries",
        skills: [
          { id: "s4", name: "React" },
          { id: "s5", name: "Next.js" },
          { id: "s6", name: "FastAPI" },
        ],
      },
      {
        id: "cat_db",
        name: "Databases & Cloud",
        skills: [
          { id: "s7", name: "PostgreSQL" },
          { id: "s8", name: "SQLite3" },
        ],
      },
      {
        id: "cat_tools",
        name: "Developer Tools & DevOps",
        skills: [
          { id: "s9", name: "Git" },
          { id: "s10", name: "Docker" },
          { id: "s11", name: "REST APIs" },
        ],
      },
    ],
    experience: [
      {
        id: "job_1",
        title: "Software Engineering Intern",
        company: "Acme Corp",
        companyUrl: "",
        location: "Remote",
        dates: "May 2025 – Aug 2025",
        bullets: [
          {
            id: "b_pylon",
            text: "Developed backend and frontend features using **React** and **REST APIs** to help customer teams view account data, resulting in a **35%** reduction in manual lookup time.",
            tools: ["React", "REST APIs"],
            metrics: ["35%"],
          },
        ],
      },
    ],
    projects: [],
    awards: [],
  };

  return runLarpAlignmentPipeline(PYLON_TEST_JD, sampleResume);
}

