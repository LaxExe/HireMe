import { TECH_DICTIONARY, type TechEntry } from "../keywordMatch";
import type {
  CatalogEntry,
  Context,
  RewriteRuleSpec,
  SkillCategory,
  SkillsCategoryBucket,
  SuffixRuleSpec,
  Tier,
} from "./types";

function slugId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+\+/g, "pp")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function mapDictCategoryToSkillsBucket(
  cat: TechEntry["category"]
): SkillsCategoryBucket {
  if (cat === "Languages") return "Languages";
  if (cat === "Frameworks & Libraries") return "Frameworks & Libraries";
  if (cat === "Databases & Cloud") return "Databases & Cloud";
  return "Developer Tools & DevOps";
}

function defaultTierForDictCategory(cat: TechEntry["category"]): Tier {
  if (cat === "Languages") return "tier_2_banned";
  return "tier_1_5_skills_only";
}

interface CatalogOverride {
  id: string;
  label: string;
  aliases: string[];
  weakAliases?: string[];
  tier: Tier;
  caseSensitive?: boolean;
  skillsCategory?: SkillsCategoryBucket;
  alsoSkills?: boolean;
  adjacentTo?: string[];
  pairsWith?: string[];
  contexts?: Context[];
  rules?: RewriteRuleSpec[];
  suffixes?: SuffixRuleSpec[];
}

const GENERIC_TECH_SUFFIXES: SuffixRuleSpec[] = [
  {
    suffix: " using {kw}",
    score: 78,
    reason: "Appended {label} to existing implementation clause",
    contexts: ["backend", "frontend", "infra"],
  },
  {
    suffix: " with {kw}",
    score: 76,
    reason: "Paired {label} alongside existing workflow",
    contexts: ["backend", "frontend", "infra"],
  },
];

const WORKFLOW_TRACKING_SUFFIXES: SuffixRuleSpec[] = [
  {
    suffix: ", tracked in {kw}",
    score: 86,
    reason: "Centralized {label} mention on product/feature bullet",
    contexts: ["frontend", "backend", "infra"],
  },
];

const V1_OVERRIDES_AND_RULES: CatalogOverride[] = [
  // Hard Primary Languages & Deep Internals -> TIER_2_BANNED if user does not already have them
  { id: "golang", label: "Golang", aliases: ["golang", "go"], caseSensitive: true, tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "rust", label: "Rust", aliases: ["rust", "rustlang"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "scala", label: "Scala", aliases: ["scala"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "ruby_on_rails", label: "Ruby on Rails", aliases: ["ruby on rails", "rails", "ruby"], tier: "tier_2_banned", skillsCategory: "Frameworks & Libraries" },
  { id: "cuda", label: "CUDA", aliases: ["cuda", "tensorrt"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "kubernetes", label: "Kubernetes", aliases: ["kubernetes", "k8s", "eks", "helm"], tier: "tier_2_banned", skillsCategory: "Developer Tools & DevOps" },
  { id: "csharp", label: "C#", aliases: ["c#", "csharp", ".net", "asp.net"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "kotlin", label: "Kotlin", aliases: ["kotlin"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "swift", label: "Swift", aliases: ["swift", "swiftui"], caseSensitive: true, tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "elixir", label: "Elixir", aliases: ["elixir", "erlang"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "php", label: "PHP", aliases: ["php", "laravel"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "cpp", label: "C++", aliases: ["c++", "c++17", "c++20", "cpp"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "java", label: "Java", aliases: ["java", "spring boot", "jvm"], tier: "tier_2_banned", skillsCategory: "Languages" },
  { id: "python", label: "Python", aliases: ["python", "python3"], tier: "tier_2_banned", skillsCategory: "Languages" },

  // Standard Web / Data Languages & Frameworks
  { id: "typescript", label: "TypeScript", aliases: ["typescript", "ts"], caseSensitive: true, tier: "tier_1_5_skills_only", skillsCategory: "Languages", adjacentTo: ["javascript", "react", "next_js", "node_js"] },
  { id: "javascript", label: "JavaScript", aliases: ["javascript", "js"], caseSensitive: true, tier: "tier_1_5_skills_only", skillsCategory: "Languages", adjacentTo: ["typescript", "react", "next_js"] },
  { id: "sql", label: "SQL", aliases: ["sql"], tier: "tier_1_5_skills_only", skillsCategory: "Languages", adjacentTo: ["postgresql", "sqlite", "supabase"] },
  { id: "react", label: "React", aliases: ["react", "react.js", "reactjs"], tier: "tier_2_banned", skillsCategory: "Frameworks & Libraries" },
  { id: "next_js", label: "Next.js", aliases: ["next.js", "nextjs"], tier: "tier_1_5_skills_only", skillsCategory: "Frameworks & Libraries", adjacentTo: ["react", "typescript"] },
  { id: "node_js", label: "Node.js", aliases: ["node.js", "nodejs", "node"], caseSensitive: true, tier: "tier_1_5_skills_only", skillsCategory: "Frameworks & Libraries", adjacentTo: ["typescript", "javascript", "express"] },
  { id: "fastapi", label: "FastAPI", aliases: ["fastapi"], tier: "tier_1_5_skills_only", skillsCategory: "Frameworks & Libraries", adjacentTo: ["python", "flask"] },
  { id: "flask", label: "Flask", aliases: ["flask"], tier: "tier_1_5_skills_only", skillsCategory: "Frameworks & Libraries", adjacentTo: ["python", "fastapi"] },
  { id: "express", label: "Express", aliases: ["express", "express.js"], tier: "tier_1_5_skills_only", skillsCategory: "Frameworks & Libraries", adjacentTo: ["node_js", "typescript"] },
  { id: "pytorch", label: "PyTorch", aliases: ["pytorch"], tier: "tier_2_banned", skillsCategory: "Frameworks & Libraries" },
  { id: "pandas", label: "Pandas", aliases: ["pandas"], tier: "tier_1_5_skills_only", skillsCategory: "Frameworks & Libraries", adjacentTo: ["python", "numpy"] },

  // TIER 1: Concrete Technical Wrappers & Integrations (with data-driven rules, contexts, pairsWith)
  {
    id: "tailwind_css",
    label: "Tailwind CSS",
    aliases: ["tailwind", "tailwind css", "tailwindcss"],
    tier: "tier_1_framing",
    alsoSkills: true,
    skillsCategory: "Frameworks & Libraries",
    contexts: ["frontend"],
    adjacentTo: ["react", "next_js", "css", "html"],
    pairsWith: ["React", "Next.js", "TypeScript", "HTML", "CSS"],
    rules: [
      {
        find: /\b\*\*TypeScript, Next\.js, React\*\*/i,
        replace: "**TypeScript, Next.js, React, {label}**",
        score: 95,
        reason: "Appended Tailwind CSS to existing Next.js/React frontend stack",
        contexts: ["frontend"],
      },
    ],
    suffixes: GENERIC_TECH_SUFFIXES,
  },
  {
    id: "aws",
    label: "AWS",
    aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"],
    weakAliases: ["ec2", "s3", "lambda"],
    tier: "tier_1_framing",
    alsoSkills: true,
    skillsCategory: "Databases & Cloud",
    contexts: ["infra", "backend"],
    adjacentTo: ["supabase", "firebase", "docker", "postgresql", "fastapi", "flask"],
    pairsWith: ["Supabase", "Firebase", "Docker", "PostgreSQL", "FastAPI", "Flask", "REST APIs", "Vercel"],
    rules: [
      {
        find: /\bto \*\*Supabase\*\*\.$/i,
        replace: "to **Supabase** on {kw}.",
        score: 98,
        reason: "Centralized cloud hosting context on backend API persistence",
      },
      {
        find: /\bdeployed on \*\*Firebase Cloud Functions\*\*/i,
        replace: "deployed on {kw} and **Firebase**",
        score: 95,
        reason: "Natural cloud deployment pairing on existing serverless agent bullet",
      },
      {
        find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "across $1 internal services on {kw}.",
        score: 92,
        reason: "Lightweight cloud hosting context on internal backend services",
      },
      {
        find: /\busing \*\*React\*\* and \*\*REST APIs\*\*/i,
        replace: "using **React**, **REST APIs**, and {kw}",
        score: 88,
        reason: "Appended AWS to existing stack list",
        contexts: ["backend", "infra"],
      },
      {
        find: /(\b(?:APIs?|services?|pipeline|backend|server|PostgreSQL|FastAPI|Flask|Node\.js)\b[\s\S]*)\.$/i,
        replace: "$1 on {kw}.",
        score: 84,
        reason: "Appended lightweight AWS hosting context to backend bullet",
        contexts: ["backend", "infra"],
      },
    ],
    suffixes: GENERIC_TECH_SUFFIXES,
  },
  {
    id: "redis",
    label: "Redis",
    aliases: ["redis"],
    tier: "tier_1_framing",
    alsoSkills: true,
    skillsCategory: "Databases & Cloud",
    contexts: ["backend"],
    adjacentTo: ["postgresql", "supabase", "fastapi", "flask", "node_js", "express"],
    pairsWith: ["PostgreSQL", "Supabase", "REST APIs", "FastAPI", "Flask", "Node.js", "Express"],
    rules: [
      {
        find: /\bDeveloped \*\*REST APIs\*\* and relational \*\*PostgreSQL\*\* schemas to standardize eligibility records across (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "Built **REST APIs**, {kw} cache, and **PostgreSQL** schemas standardizing records across $1 services.",
        score: 99,
        reason: "Added Redis caching and tightened bullet to fit cleanly inside 1-line area",
      },
      {
        find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "across $1 internal services with {kw} caching.",
        score: 97,
        reason: "Natural TTL/read-through caching addition on PostgreSQL + REST API bullet",
      },
      {
        find: /\brelational \*\*PostgreSQL\*\* schemas\b/i,
        replace: "**PostgreSQL** schemas and {kw} caching",
        score: 94,
        reason: "Paired Redis caching alongside PostgreSQL schemas",
      },
      {
        find: /\bto \*\*Supabase\*\*\.$/i,
        replace: "to **Supabase** and {kw}.",
        score: 89,
        reason: "Added Redis state store alongside Supabase persistence",
      },
      {
        find: /\*\*PostgreSQL\*\*/i,
        replace: "**PostgreSQL** and {kw}",
        score: 85,
        reason: "Paired Redis alongside PostgreSQL in backend bullet",
        contexts: ["backend"],
      },
    ],
    suffixes: GENERIC_TECH_SUFFIXES,
  },
  {
    id: "graphql",
    label: "GraphQL",
    aliases: ["graphql"],
    tier: "tier_1_framing",
    alsoSkills: true,
    skillsCategory: "Frameworks & Libraries",
    contexts: ["backend", "frontend"],
    adjacentTo: ["rest_apis", "react", "next_js", "typescript"],
    pairsWith: ["REST APIs", "React", "Next.js", "TypeScript", "Node.js", "PostgreSQL"],
    rules: [
      {
        find: /\band \*\*REST APIs\*\*\.$/i,
        replace: "**REST**, and **{label} APIs**.",
        score: 96,
        reason: "Minimal 2-word API query layer addition next to REST APIs",
      },
      {
        find: /\bDeveloped \*\*REST APIs\*\* and\b/i,
        replace: "Built **REST/{label} APIs** and",
        score: 94,
        reason: "Paired GraphQL with REST APIs in backend service bullet",
      },
      {
        find: /\bintegrating external \*\*REST APIs\*\*/i,
        replace: "integrating **REST** and **{label} APIs**",
        score: 91,
        reason: "Replaced adjective 'external' with GraphQL alongside REST APIs",
      },
      {
        find: /\*\*REST APIs\*\*/i,
        replace: "**REST** and **{label} APIs**",
        score: 86,
        reason: "Paired GraphQL alongside REST APIs",
      },
    ],
    suffixes: GENERIC_TECH_SUFFIXES,
  },
  {
    id: "webhooks",
    label: "Webhooks",
    aliases: ["webhook", "webhooks"],
    tier: "tier_1_framing",
    contexts: ["backend", "infra"],
    adjacentTo: ["rest_apis", "flask", "fastapi", "twilio"],
    pairsWith: ["Twilio", "Flask", "FastAPI", "REST APIs", "Stripe"],
    rules: [
      {
        find: /\bhandled WhatsApp\/SMS via \*\*Twilio\*\*/i,
        replace: "handled WhatsApp/SMS {kw} via **Twilio**",
        score: 96,
        reason: "Natural Twilio webhook event handling context",
      },
      {
        find: /\bvia \*\*Flask\*\* backend \*\*APIs\*\*/i,
        replace: "via **Flask** {kw} and **APIs**",
        score: 92,
        reason: "Added Webhooks to Flask event intake API bullet",
      },
    ],
    suffixes: GENERIC_TECH_SUFFIXES,
  },
  {
    id: "docker",
    label: "Docker",
    aliases: ["docker", "containerization", "containers"],
    weakAliases: ["containerization", "containers"],
    tier: "tier_1_framing",
    alsoSkills: true,
    skillsCategory: "Developer Tools & DevOps",
    contexts: ["infra", "backend"],
    adjacentTo: ["linux", "python", "fastapi", "flask", "postgresql"],
    pairsWith: ["FastAPI", "Flask", "PostgreSQL", "Python", "Linux", "AWS", "REST APIs"],
    rules: [
      {
        find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "across $1 {kw} services.",
        score: 93,
        reason: "Added Docker container context to internal services bullet",
        contexts: ["infra", "backend"],
      },
    ],
    suffixes: GENERIC_TECH_SUFFIXES,
  },
  {
    id: "ci_cd",
    label: "CI/CD",
    aliases: ["ci/cd", "continuous integration", "continuous deployment"],
    tier: "tier_0_workflow",
    alsoSkills: true,
    skillsCategory: "Developer Tools & DevOps",
    contexts: ["infra", "backend"],
    pairsWith: ["Git", "GitHub Actions", "Docker"],
  },

  // TIER 1.5: Skills Section Only
  { id: "postgresql", label: "PostgreSQL", aliases: ["postgresql", "postgres"], tier: "tier_1_5_skills_only", skillsCategory: "Databases & Cloud" },
  { id: "mongodb", label: "MongoDB", aliases: ["mongodb", "mongo"], tier: "tier_1_5_skills_only", skillsCategory: "Databases & Cloud", adjacentTo: ["postgresql", "supabase"] },
  { id: "supabase", label: "Supabase", aliases: ["supabase"], tier: "tier_1_5_skills_only", skillsCategory: "Databases & Cloud", adjacentTo: ["postgresql", "firebase"] },
  { id: "firebase", label: "Firebase", aliases: ["firebase", "firestore"], tier: "tier_1_5_skills_only", skillsCategory: "Databases & Cloud", adjacentTo: ["supabase"] },
  { id: "github_actions", label: "GitHub Actions", aliases: ["github actions"], tier: "tier_1_5_skills_only", skillsCategory: "Developer Tools & DevOps", adjacentTo: ["git", "ci_cd"] },
  { id: "postman", label: "Postman", aliases: ["postman"], tier: "tier_1_5_skills_only", skillsCategory: "Developer Tools & DevOps", adjacentTo: ["rest_apis"] },
  { id: "vercel", label: "Vercel", aliases: ["vercel"], tier: "tier_1_5_skills_only", skillsCategory: "Databases & Cloud", adjacentTo: ["next_js", "react"] },
  { id: "cloudflare", label: "Cloudflare", aliases: ["cloudflare"], tier: "tier_1_5_skills_only", skillsCategory: "Databases & Cloud" },
  { id: "git", label: "Git", aliases: ["git", "github"], weakAliases: ["github"], tier: "tier_1_5_skills_only", skillsCategory: "Developer Tools & DevOps" },
  { id: "linux", label: "Linux", aliases: ["linux", "unix"], tier: "tier_1_5_skills_only", skillsCategory: "Developer Tools & DevOps" },
  { id: "rest_apis", label: "REST APIs", aliases: ["rest", "rest api", "rest apis", "restful"], caseSensitive: true, tier: "tier_1_5_skills_only", skillsCategory: "Developer Tools & DevOps" },

  // TIER 0: Workflow & Agile
  {
    id: "jira",
    label: "Jira",
    aliases: ["jira"],
    tier: "tier_0_workflow",
    alsoSkills: true,
    skillsCategory: "Developer Tools & DevOps",
    contexts: ["frontend", "backend", "infra"],
    rules: [
      {
        find: /\bGave clients control over call workflows and dispatch timing\b/i,
        replace: "Gave clients control over {kw}-tracked call workflows and dispatch timing",
        score: 95,
        reason: "Centralized Jira workflow mention on client dispatch & dashboard bullet",
      },
      {
        find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "across $1 internal services tracked in {kw}.",
        score: 91,
        reason: "Centralized Jira sprint tracking on internal services bullet",
      },
      {
        find: /(\b(?:workflows?|features?|dashboards?|services?|sprints?)\b[\s\S]*)\.$/i,
        replace: "$1, tracked in {kw}.",
        score: 86,
        reason: "Centralized Jira mention on product/feature bullet",
        contexts: ["frontend", "backend"],
      },
    ],
    suffixes: WORKFLOW_TRACKING_SUFFIXES,
  },
  {
    id: "linear",
    label: "Linear",
    aliases: ["linear"],
    tier: "tier_0_workflow",
    alsoSkills: true,
    skillsCategory: "Developer Tools & DevOps",
    contexts: ["frontend", "backend", "infra"],
    rules: [
      {
        find: /\bGave clients control over call workflows and dispatch timing\b/i,
        replace: "Gave clients control over {kw}-tracked call workflows and dispatch timing",
        score: 95,
        reason: "Centralized Linear workflow mention on client dispatch & dashboard bullet",
      },
      {
        find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "across $1 internal services tracked in {kw}.",
        score: 91,
        reason: "Centralized Linear sprint tracking on internal services bullet",
      },
      {
        find: /(\b(?:workflows?|features?|dashboards?|services?|sprints?)\b[\s\S]*)\.$/i,
        replace: "$1, tracked in {kw}.",
        score: 86,
        reason: "Centralized Linear mention on product/feature bullet",
        contexts: ["frontend", "backend"],
      },
    ],
    suffixes: WORKFLOW_TRACKING_SUFFIXES,
  },
  {
    id: "agile",
    label: "Agile",
    aliases: ["agile", "scrum", "kanban", "sprints"],
    tier: "tier_0_workflow",
    contexts: ["frontend", "backend", "infra"],
    rules: [
      {
        find: /(\b(?:Developed|Built|Shipped)\b[\s\S]*)\.$/i,
        replace: "$1 in {kw} sprints.",
        score: 85,
        reason: "Centralized Agile sprint mention on feature delivery bullet",
        contexts: ["frontend", "backend"],
      },
    ],
    suffixes: [
      {
        suffix: " in {kw} sprints",
        score: 85,
        reason: "Centralized Agile sprint mention on feature delivery bullet",
        contexts: ["frontend", "backend"],
        requiresVerb: /\b(?:Developed|Built|Shipped)\b/i,
      },
    ],
  },
  {
    id: "end_to_end",
    label: "end-to-end",
    aliases: ["end-to-end", "end to end", "e2e ownership"],
    tier: "tier_0_workflow",
    contexts: ["frontend", "backend", "infra"],
    rules: [
      {
        find: /^(Developed|Built)\s+(?!\*\*end-to-end\*\*)/i,
        replace: "$1 {kw} ",
        score: 88,
        reason: "Centralized end-to-end ownership qualifier on a single feature bullet",
      },
    ],
  },
];

function toCatalogEntry(override: CatalogOverride): CatalogEntry {
  return {
    id: override.id,
    label: override.label,
    name: override.label,
    aliases: override.aliases,
    weakAliases: override.weakAliases,
    tier: override.tier,
    defaultTierIfMissing: override.tier,
    caseSensitive: override.caseSensitive,
    skillsCategory: override.skillsCategory,
    targetSkillCategory: override.skillsCategory,
    alsoSkills: override.alsoSkills,
    alsoSkillsOnly: override.alsoSkills,
    adjacentTo: override.adjacentTo,
    pairsWith: override.pairsWith,
    contexts: override.contexts,
    rules: override.rules,
    suffixes: override.suffixes,
  };
}

/**
 * Builds the comprehensive catalog starting from `V1_OVERRIDES_AND_RULES` (preserving exact ordering
 * for v1 tiering compatibility) and extending with any additional entries from `TECH_DICTIONARY`.
 */
export function catalogFromDictionary(
  includeExtendedDictionary = false
): CatalogEntry[] {
  const coreEntries = V1_OVERRIDES_AND_RULES.map(toCatalogEntry);
  if (!includeExtendedDictionary) {
    return coreEntries;
  }

  const seenIds = new Set(coreEntries.map((e) => e.id));
  const seenAliases = new Set(
    coreEntries.flatMap((e) => [e.label.toLowerCase(), ...e.aliases.map((a) => a.toLowerCase())])
  );

  const extended: CatalogEntry[] = [...coreEntries];

  for (const dictEntry of TECH_DICTIONARY) {
    const id = slugId(dictEntry.name);
    if (seenIds.has(id) || seenAliases.has(dictEntry.name.toLowerCase())) continue;

    const tier = defaultTierForDictCategory(dictEntry.category);
    const skillsCategory = mapDictCategoryToSkillsBucket(dictEntry.category);

    seenIds.add(id);
    extended.push({
      id,
      label: dictEntry.name,
      name: dictEntry.name,
      aliases: dictEntry.aliases,
      tier,
      defaultTierIfMissing: tier,
      skillsCategory,
      targetSkillCategory: skillsCategory,
    });
  }

  return extended;
}

export const LARP_CATALOG: CatalogEntry[] = catalogFromDictionary(false);
export const EXTENDED_LARP_CATALOG: CatalogEntry[] = catalogFromDictionary(true);

/**
 * Adds a newly discovered technical term to the active `LARP_CATALOG` and `EXTENDED_LARP_CATALOG` at runtime.
 */
export function registerCustomCatalogTerm(params: {
  label: string;
  tier?: Tier;
  skillsCategory?: SkillsCategoryBucket;
}): CatalogEntry {
  const clean = params.label.trim();
  const id = slugId(clean);
  const existing = findCatalogEntry(clean);
  if (existing) return existing;

  const tier = params.tier ?? "tier_1_5_skills_only";
  const skillsCategory = params.skillsCategory ?? "Developer Tools & DevOps";
  const entry: CatalogEntry = {
    id,
    label: clean,
    name: clean,
    aliases: [clean.toLowerCase()],
    tier,
    defaultTierIfMissing: tier,
    skillsCategory,
    targetSkillCategory: skillsCategory,
    alsoSkills: tier === "tier_1_framing" || tier === "tier_0_workflow",
    alsoSkillsOnly: tier === "tier_1_framing" || tier === "tier_0_workflow",
    contexts: ["backend", "frontend", "infra"],
    suffixes:
      tier === "tier_1_framing"
        ? GENERIC_TECH_SUFFIXES
        : tier === "tier_0_workflow"
        ? WORKFLOW_TRACKING_SUFFIXES
        : undefined,
  };

  LARP_CATALOG.push(entry);
  EXTENDED_LARP_CATALOG.push(entry);
  return entry;
}

export function findCatalogEntry(keywordOrId: string): CatalogEntry | undefined {
  const lower = keywordOrId.toLowerCase();
  return (
    LARP_CATALOG.find(
      (e) =>
        e.id === lower ||
        e.label.toLowerCase() === lower ||
        e.aliases.some((a) => a.toLowerCase() === lower)
    ) ??
    EXTENDED_LARP_CATALOG.find(
      (e) =>
        e.id === lower ||
        e.label.toLowerCase() === lower ||
        e.aliases.some((a) => a.toLowerCase() === lower)
    )
  );
}

export function matchCategoryBucket(catName: string): SkillsCategoryBucket {
  const upper = catName.toUpperCase();
  if (/LANGUAGE/.test(upper)) return "Languages";
  if (/FRAMEWORK|LIBRAR/.test(upper)) return "Frameworks & Libraries";
  if (/DATABASE|CLOUD|DATA|STORAGE/.test(upper)) return "Databases & Cloud";
  return "Developer Tools & DevOps";
}

export function resolveTargetCategoryForSkill(
  categories: SkillCategory[],
  skillName: string,
  customCategoryByName?: Record<string, string>
): SkillCategory | undefined {
  if (categories.length === 0) return undefined;

  const customCat =
    customCategoryByName?.[skillName] ??
    Object.entries(customCategoryByName ?? {}).find(
      ([k]) => k.toLowerCase() === skillName.toLowerCase()
    )?.[1];
  if (customCat) {
    const direct = categories.find(
      (c) => c.id === customCat || c.name.toLowerCase() === customCat.toLowerCase()
    );
    if (direct) return direct;
  }

  const catalogEntry = findCatalogEntry(skillName);
  const targetBucket = catalogEntry?.skillsCategory ?? "Developer Tools & DevOps";

  return (
    categories.find((c) => matchCategoryBucket(c.name) === targetBucket) ??
    (targetBucket === "Databases & Cloud"
      ? categories.find((c) => matchCategoryBucket(c.name) === "Developer Tools & DevOps")
      : undefined) ??
    categories.find((c) => matchCategoryBucket(c.name) !== "Languages") ??
    categories[0]
  );
}
