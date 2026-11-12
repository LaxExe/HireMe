import type { Bullet, MasterResume, SkillCategory } from "./types";
import { DEFAULT_CALIBRATION } from "./types";
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
}

/**
 * Checks whether the candidate fits strictly inside the remaining space of the original
 * line count (`candLines === origLines` and `candWidth <= origLines * singleLineNcu`).
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
  const maxAllowedWidth = Number((origLines * singleLineNcu).toFixed(2));
  const minAllowedWidth = Number(
    ((origLines - 1) * singleLineNcu + 0.65 * singleLineNcu).toFixed(2)
  );
  const slackNcu = Number((maxAllowedWidth - origWidth).toFixed(2));

  return {
    valid: candLines === origLines && candWidth <= maxAllowedWidth,
    origWidth,
    candWidth,
    origLines,
    candLines,
    maxAllowedWidth,
    minAllowedWidth,
    slackNcu,
    delta: Number((candWidth - origWidth).toFixed(2)),
  };
}

/* ============================================================================
 * 2. WORD-DIFF & MINIMAL EDIT VALIDATOR (<= 5-6 WORDS ADDED/CHANGED)
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

/**
 * Computes word-level LCS between original and candidate bullets to count
 * the exact number of newly added/swapped words (strictly capped at <= 6 words).
 */
export function computeWordReframeStats(
  originalMarkup: string,
  candidateMarkup: string,
  maxWordsCap = 6
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
 * 3. THE 4-TIER KEYWORD CLASSIFICATION SPEC (CODE-FIRST, NO PM JARGON)
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
  /** Which bullet technical contexts this tool can naturally be added to */
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

  // TIER 1.5: Skills Section Only (Kept out of bullets to avoid clutter/jargon)
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

  // TIER 0: Workflow & Agile (Recognized from JD, kept centralized in Skills section only — never stuffed into code bullets)
  { name: "Jira", aliases: ["jira"], defaultTierIfMissing: "tier_0_workflow", alsoSkillsOnly: true, targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Linear", aliases: ["linear"], defaultTierIfMissing: "tier_0_workflow", alsoSkillsOnly: true, targetSkillCategory: "Developer Tools & DevOps" },
  { name: "Agile", aliases: ["agile", "scrum", "kanban"], defaultTierIfMissing: "tier_0_workflow" },
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
 * 5. STEP 3: CONTEXT-AWARE, CENTRALIZED MINIMAL BULLET INJECTION
 * ============================================================================
 * Core Principles:
 * 1. Centralize edits: Each missing Tier 1 technical tool (e.g., AWS, Redis, GraphQL)
 *    is placed in AT MOST ONE bullet across the entire resume — specifically the bullet
 *    where it is most natural to defend and hardest to over-verify.
 * 2. Context awareness: Never inject web/cloud tools into C++/systems/OS-hook/robotics
 *    bullets. Only match bullets whose technical context fits the tool.
 * 3. Space-first check: Only apply an edit to a bullet that ALREADY has enough free
 *    horizontal space on its current line (1L or 2L) to fit the 2-5 word addition without
 *    rewriting the sentence or overflowing onto a new line.
 * 4. Minimal diff: Change only 1-5 words (e.g. appending `on **AWS**`, `with **Redis** caching`,
 *    or `and **GraphQL**` to an existing tool list), keeping 95%+ of the bullet identical.
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

/**
 * Classifies what a bullet is actually about so we never inject cloud/web tools
 * into C++ OS hooks, embedded systems, or robotics bullets.
 */
export function classifyBulletContext(
  bulletMarkup: string,
  containerTitle: string
): BulletDomainContext {
  const combined = `${containerTitle} ${plainText(bulletMarkup)}`;

  // 1. Check if this is a low-level C++, OS hook, desktop, or robotics/autonomous bullet
  if (
    /\b(?:CGEventTap|WH_KEYBOARD_LL|SymSpell|llama\.cpp|SmolLM2|Qt6|Win32|macOS desktop|ROS\s*2|LiDAR|Gazebo|Foxglove|Pure Pursuit|costmap|odometry|rover|sensor-fusion|Raft consensus|Write-Ahead Log)\b/i.test(
      combined
    )
  ) {
    return "systems-cpp-robotics";
  }

  // 2. Check if frontend / dashboard / UI focused
  if (
    /\b(?:React|Next\.js|dashboards?|UI|frontend|Tailwind|components|CSV\/Excel report)\b/i.test(
      combined
    )
  ) {
    return "frontend-ui";
  }

  // 3. Check if cloud deployment / CI/CD / serverless focused
  if (
    /\b(?:deployed on|Firebase Cloud Functions|Docker|CI\/CD|GitHub Actions|serverless|container)\b/i.test(
      combined
    )
  ) {
    return "cloud-deploy-infra";
  }

  // 4. Default for backend / API / database / Python / service bullets
  return "backend-api-db";
}

/**
 * Attempts a minimal 1-to-5 word surgical addition of `keyword` into `origMarkup`
 * ONLY if the bullet's context matches and the bullet has enough free space on its current line.
 */
function tryMinimalKeywordInjection(
  origMarkup: string,
  context: BulletDomainContext,
  keyword: string
): { mutatedMarkup: string; reason: string; fitScore: number } | null {
  if (context === "systems-cpp-robotics") return null;
  if (containsPhrase(plainText(origMarkup), keyword)) return null;

  const trimmed = origMarkup.trim();

  if (keyword === "AWS") {
    // Best spot 1: A bullet that persists/deploys backend services or cloud functions (e.g. Flask/Supabase/Firebase/Python)
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
      if (/\b(?:APIs?|services?|pipeline|backend|server|PostgreSQL|FastAPI|Flask|Node\.js)\b/i.test(trimmed) && /\.$/.test(trimmed)) {
        return {
          mutatedMarkup: trimmed.replace(/\.$/, " on **AWS**."),
          reason: "Appended lightweight AWS hosting context to backend bullet with free line space",
          fitScore: 84,
        };
      }
    }
  }

  if (keyword === "Redis") {
    // Best spot: A bullet about PostgreSQL schemas, database queries, or backend APIs with ample line slack
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
    // Best spot: Right next to an existing REST APIs mention in a frontend or backend bullet
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
          "Developed **REST** and **GraphQL APIs** with"
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

  return null;
}

/* ============================================================================
 * 6. FULL LARP ALIGNMENT PIPELINE (CENTRALIZED, SPACE-AWARE, MINIMAL)
 * ============================================================================ */

export interface LarpAlignmentRun {
  tiers: LarpTierClassification;
  skillSwaps: SkillSwapChange[];
  updatedSkills: SkillCategory[];
  bulletProposals: BulletMutationProposal[];
  guardrailVerifiedZeroBanned: boolean;
}

/**
 * Executes the refined Defensible Resume Alignment (LARP) Pipeline:
 * 1. Classifies JD keywords into the 5 defensibility buckets (blocking Tier 2 Banned).
 * 2. Runs the Skills Section Smart-Swapper (`<= 98.0 NCU` per category line).
 * 3. Globally selects AT MOST 1 best, space-permitting bullet per missing Tier 1 technical tool
 *    (prioritizing easily defensible backend/service/project bullets with ample free line space),
 *    applying a minimal 1-to-5 word addition without rewriting the sentence or overflowing lines.
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

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMaxChars = cal.oneLineMax || 108;
  const twoLineMaxChars = cal.twoLineMax || 216;

  // Collect all candidate bullets with their context and available line slack
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
      // Prefer earlier/secondary roles or bullets with more slack that are easy to explain
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
        defensibilityBonus: 6, // Small projects are very easy to defend
        origPlainLen,
        maxAllowedChars,
        charSlack,
      });
    }
  }

  // For each Tier 1 technical tool (e.g. AWS, Redis, GraphQL, Tailwind CSS, Webhooks, Docker),
  // find the SINGLE best bullet slot that has enough free space on its current line.
  const usedBulletIds = new Set<string>();
  const bulletProposals: BulletMutationProposal[] = [];
  const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());

  for (const keyword of tiers.tier_1_framing) {
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
      // Require at least 8 characters of free space on the current line before even trying
      if (slot.charSlack < 8) continue;

      const attempt = tryMinimalKeywordInjection(slot.bullet.text, slot.context, keyword);
      if (!attempt) continue;

      const newPlainLen = plainText(attempt.mutatedMarkup).trim().length;
      // Must fit strictly within the bullet's existing calibrated 1-line or 2-line character cap!
      if (newPlainLen > slot.maxAllowedChars) continue;

      // Verify zero Tier 2 Banned terms
      if (bannedLower.some((b) => containsPhrase(plainText(attempt.mutatedMarkup), b))) continue;

      const origLatex = `\\item ${markupToLatex(slot.bullet.text)}`;
      const candLatex = `\\item ${markupToLatex(attempt.mutatedMarkup)}`;
      const budget = checkLineBudget(origLatex, candLatex, 98.0);
      if (!budget.valid) continue;

      const wordStats = computeWordReframeStats(slot.bullet.text, attempt.mutatedMarkup, 6);
      if (!wordStats.withinCap) continue;

      const totalScore = attempt.fitScore + slot.defensibilityBonus + Math.min(10, slot.charSlack / 5);
      if (!bestProposal || totalScore > bestProposal.score) {
        bestProposal = {
          slot,
          mutatedMarkup: attempt.mutatedMarkup,
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

  // Final Guardrail Verification: confirm 0 occurrences of any tier_2_banned term in mutated outputs
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
- Comfortable with Agile workflows and tracking issues in Jira.`;
