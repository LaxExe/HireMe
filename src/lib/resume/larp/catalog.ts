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
    score: 68,
    reason: "Appended {label} to existing implementation clause",
    contexts: ["backend", "frontend", "infra"],
  },
  {
    suffix: " with {kw}",
    score: 68,
    reason: "Paired {label} alongside existing workflow",
    contexts: ["backend", "frontend", "infra"],
  },
];

const WORKFLOW_TRACKING_SUFFIXES: SuffixRuleSpec[] = [
  {
    suffix: ", tracked in {kw}",
    score: 68,
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
  {
    id: "linux",
    label: "Linux",
    aliases: ["linux", "unix", "ubuntu", "debian", "posix"],
    tier: "tier_1_5_skills_only",
    skillsCategory: "Developer Tools & DevOps",
    contexts: ["systems", "infra", "backend"],
    pairsWith: [
      "C++",
      "C",
      "ROS 2",
      "Gazebo",
      "Python",
      "Docker",
      "FastAPI",
      "Flask",
      "PostgreSQL",
      "Git",
      "Slurm",
      "PyTorch",
      "REST APIs",
      "Firebase",
      "Supabase",
      "Twilio",
    ],
    rules: [
      {
        find: /\bin \*\*Gazebo\*\* simulation\b/i,
        replace: "in **Gazebo** on {kw}",
        score: 97,
        reason: "Paired Linux environment context directly with Gazebo simulation",
        contexts: ["systems"],
      },
      {
        find: /\bdeployed on \*\*Firebase Cloud Functions\*\*/i,
        replace: "deployed on {kw} and **Firebase**",
        score: 95,
        reason: "Added Linux host context alongside serverless deployment",
        contexts: ["backend", "infra"],
      },
      {
        find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        replace: "across $1 {kw} services.",
        score: 95,
        reason: "Specified Linux runtime environment across internal backend services",
        contexts: ["backend", "infra"],
      },
      {
        find: /\bacross \*\*Slurm\*\* compute clusters\b/i,
        replace: "across {kw} **Slurm** clusters",
        score: 95,
        reason: "Specified Linux OS environment on Slurm compute clusters",
        contexts: ["backend", "infra", "systems"],
      },
      {
        find: /\bto \*\*Supabase\*\*\.$/i,
        replace: "to **Supabase** on {kw}.",
        score: 93,
        reason: "Added Linux runtime environment to backend service bullet",
        contexts: ["backend", "infra"],
      },
      {
        find: /(\b(?:C\+\+|ROS\s*2|Gazebo|Python|FastAPI|Flask|PostgreSQL|PyTorch|APIs?|services?|pipeline|simulation|clusters?|servers?|nodes?|mapping|planning)\b[\s\S]*)\.$/i,
        replace: "$1 on {kw}.",
        score: 92,
        reason: "Added Linux environment context to technical workflow",
        contexts: ["systems", "infra", "backend"],
      },
    ],
    suffixes: [
      {
        suffix: " on {kw}",
        score: 88,
        reason: "Added Linux runtime environment context",
        contexts: ["systems", "infra", "backend"],
      },
    ],
  },
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

function buildDefaultInjectionSpecForTech(
  id: string,
  label: string,
  skillsCategory?: SkillsCategoryBucket
): Pick<CatalogEntry, "contexts" | "pairsWith" | "rules" | "suffixes"> {
  if (id === "c") {
    return {
      contexts: ["systems", "backend"],
      pairsWith: ["C++", "Linux", "ROS 2", "Gazebo", "Python", "CMake", "Bash"],
      rules: [
        {
          find: /\*\*C\+\+\*\*/i,
          replace: "**C/C++**",
          score: 97,
          reason: "Paired C alongside C++ in existing systems workflow",
          contexts: ["systems", "backend"],
        },
        {
          find: /(\b(?:Linux|ROS\s*2|Gazebo|simulation|planning|embedded|sensors?|nodes?)\b[\s\S]*)\.$/i,
          replace: "$1 in {kw}.",
          score: 91,
          reason: "Added C systems implementation context",
          contexts: ["systems", "backend"],
        },
      ],
      suffixes: [
        {
          suffix: " in {kw}",
          score: 86,
          reason: "Added C implementation context",
          contexts: ["systems", "backend"],
        },
      ],
    };
  }

  if (id === "cmake") {
    return {
      contexts: ["systems", "infra"],
      pairsWith: ["C++", "C", "Linux", "ROS 2", "Gazebo", "Git"],
      rules: [
        {
          find: /\bin \*\*Gazebo\*\* simulation\b/i,
          replace: "with {kw} in **Gazebo**",
          score: 96,
          reason: "Added CMake build tooling directly to C++/ROS 2 simulation workflow",
          contexts: ["systems", "infra"],
        },
        {
          find: /(\b(?:C\+\+|C|ROS\s*2|Gazebo|Linux|builds?|simulation|pipelines?)\b[\s\S]*)\.$/i,
          replace: "$1 with {kw} builds.",
          score: 93,
          reason: "Paired CMake build automation with existing systems/C++ workflow",
          contexts: ["systems", "infra"],
        },
      ],
      suffixes: [
        {
          suffix: " with {kw} builds",
          score: 88,
          reason: "Added CMake build workflow context",
          contexts: ["systems", "infra"],
        },
      ],
    };
  }

  if (id === "bash") {
    return {
      contexts: ["systems", "infra", "backend"],
      pairsWith: ["Linux", "Python", "C++", "C", "Docker", "Git", "Slurm", "PyTorch", "Firebase"],
      rules: [
        {
          find: /\bacross \*\*Slurm\*\* compute clusters\b/i,
          replace: "via {kw} on **Slurm** clusters",
          score: 96,
          reason: "Paired Bash scripting directly with Slurm cluster automation",
          contexts: ["systems", "infra", "backend"],
        },
        {
          find: /(\b(?:Linux|C\+\+|Python|Slurm|Docker|ROS\s*2|Gazebo|Firebase|pipeline|clusters?|services?|workflows?)\b[\s\S]*)\.$/i,
          replace: "$1 via {kw} scripts.",
          score: 92,
          reason: "Added Bash scripting automation to existing technical workflow",
          contexts: ["systems", "infra", "backend"],
        },
      ],
      suffixes: [
        {
          suffix: " via {kw} scripts",
          score: 87,
          reason: "Added Bash scripting automation context",
          contexts: ["systems", "infra", "backend"],
        },
      ],
    };
  }

  if (id === "unit_testing" || id === "jest") {
    return {
      contexts: ["backend", "frontend", "systems"],
      pairsWith: [
        "Python",
        "TypeScript",
        "JavaScript",
        "FastAPI",
        "Flask",
        "React",
        "Next.js",
        "REST APIs",
        "C++",
        "PostgreSQL",
      ],
      rules: [
        {
          find: /\brouted automated status alerts\b/i,
          replace: "verified flows with {kw} and alerts",
          score: 94,
          reason: "Paired automated testing with backend alert delivery",
          contexts: ["backend", "frontend", "systems"],
        },
        {
          find: /(\b(?:APIs?|services?|endpoints?|routes?|workflows?|dashboards?|schemas?|pipelines?|mapping|planning|portals?|agents?)\b[\s\S]*)\.$/i,
          replace: "$1 with {kw}.",
          score: 92,
          reason: "Added test verification context to existing engineering bullet",
          contexts: ["backend", "frontend", "systems"],
        },
      ],
      suffixes: [
        {
          suffix: " with {kw}",
          score: 88,
          reason: "Added automated testing verification context",
          contexts: ["backend", "frontend", "systems"],
        },
      ],
    };
  }

  if (id === "microservices" || id === "distributed_systems") {
    return {
      contexts: ["backend", "infra"],
      pairsWith: ["PostgreSQL", "REST APIs", "FastAPI", "Flask", "Node.js", "Python", "Docker", "Slurm", "Firebase"],
      rules: [
        {
          find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
          replace: "across $1 {kw}.",
          score: 97,
          reason: "Framed internal service architecture directly as microservices/distributed systems",
          contexts: ["backend", "infra"],
        },
        {
          find: /(\b(?:services?|APIs?|endpoints?|clusters?|pipelines?|event streams|webhooks)\b[\s\S]*)\.$/i,
          replace: "$1 across {kw}.",
          score: 92,
          reason: "Added service architecture framing to backend bullet",
          contexts: ["backend", "infra"],
        },
      ],
      suffixes: [
        {
          suffix: " across {kw}",
          score: 88,
          reason: "Added service architecture context",
          contexts: ["backend", "infra"],
        },
      ],
    };
  }

  if (id === "github_actions" || id === "ci_cd" || id === "terraform" || id === "prometheus" || id === "kafka" || id === "airflow") {
    const verb =
      id === "prometheus"
        ? "monitored via"
        : id === "terraform"
        ? "provisioned with"
        : id === "kafka"
        ? "streamed via"
        : "automated via";
    return {
      contexts: ["infra", "backend"],
      pairsWith: ["Git", "Python", "TypeScript", "FastAPI", "Flask", "Next.js", "PostgreSQL", "Supabase", "Firebase", "Docker", "Linux", "Twilio"],
      rules: [
        {
          find: /(\b(?:APIs?|services?|endpoints?|pipelines?|workflows?|event streams|alerts?|transcripts|deployments?|builds?)\b[\s\S]*)\.$/i,
          replace: `$1 ${verb} {kw}.`,
          score: 92,
          reason: `Integrated ${label} workflow context into existing backend/infra bullet`,
          contexts: ["infra", "backend"],
        },
      ],
      suffixes: [
        {
          suffix: ` ${verb} {kw}`,
          score: 88,
          reason: `Paired ${label} with existing delivery pipeline`,
          contexts: ["infra", "backend"],
        },
      ],
    };
  }

  if (id === "gcp" || id === "azure" || id === "vercel" || id === "cloudflare") {
    return {
      contexts: ["infra", "backend", "frontend"],
      pairsWith: ["Firebase", "Supabase", "Next.js", "React", "FastAPI", "Flask", "PostgreSQL", "Docker", "REST APIs"],
      rules: [
        {
          find: /\bdeployed on \*\*Firebase Cloud Functions\*\*/i,
          replace: "deployed on {kw} and **Firebase**",
          score: 96,
          reason: `Added ${label} cloud context alongside serverless deployment`,
        },
        {
          find: /\bto \*\*Supabase\*\*\.$/i,
          replace: "to **Supabase** on {kw}.",
          score: 95,
          reason: `Added ${label} cloud hosting context to persistence layer`,
        },
        {
          find: /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
          replace: "across $1 internal services on {kw}.",
          score: 93,
          reason: `Added ${label} cloud hosting context across services`,
        },
        {
          find: /(\b(?:APIs?|services?|dashboards?|portals?|pipelines?|agents?)\b[\s\S]*)\.$/i,
          replace: "$1 hosted on {kw}.",
          score: 90,
          reason: `Added ${label} hosting context to cloud/web bullet`,
        },
      ],
      suffixes: [
        {
          suffix: " on {kw}",
          score: 86,
          reason: `Added ${label} hosting context`,
          contexts: ["infra", "backend", "frontend"],
        },
      ],
    };
  }

  if (
    id === "sql" ||
    id === "nosql" ||
    id === "postgresql" ||
    id === "mysql" ||
    id === "sqlite" ||
    id === "mongodb" ||
    id === "dynamodb" ||
    id === "cassandra" ||
    id === "elasticsearch" ||
    id === "supabase" ||
    id === "firebase" ||
    id === "snowflake" ||
    id === "bigquery"
  ) {
    return {
      contexts: ["backend", "infra"],
      pairsWith: ["PostgreSQL", "Supabase", "Firebase", "SQLite3", "SQL", "Python", "FastAPI", "Flask", "REST APIs", "Next.js", "TypeScript"],
      rules: [
        {
          find: /\brelational \*\*PostgreSQL\*\* schemas\b/i,
          replace:
            id === "sql"
              ? "**{label} PostgreSQL** schemas"
              : "**PostgreSQL** and {kw} schemas",
          score: 96,
          reason: `Integrated ${label} alongside existing database schemas`,
          contexts: ["backend", "infra"],
        },
        {
          find: /\bto \*\*Supabase\*\*\.$/i,
          replace: "to **Supabase** and {kw}.",
          score: 95,
          reason: `Paired ${label} with existing data persistence layer`,
          contexts: ["backend", "infra"],
        },
        {
          find: /(\b(?:schemas?|records|transcripts|queries|data|APIs?|services?|pipelines?|backend)\b[\s\S]*)\.$/i,
          replace: "$1 backed by {kw}.",
          score: 92,
          reason: `Added ${label} persistence context to data/backend bullet`,
          contexts: ["backend", "infra"],
        },
      ],
      suffixes: [
        {
          suffix: " backed by {kw}",
          score: 88,
          reason: `Added ${label} persistence context`,
          contexts: ["backend", "infra"],
        },
      ],
    };
  }

  if (id === "oauth" || id === "websockets" || id === "grpc" || id === "rest_apis") {
    const prep = id === "oauth" ? "with" : "over";
    return {
      contexts: ["backend", "frontend", "infra"],
      pairsWith: ["FastAPI", "Flask", "Node.js", "Next.js", "React", "TypeScript", "REST APIs", "Twilio", "Supabase", "Firebase"],
      rules: [
        {
          find: /(\b(?:real-time|voice|APIs?|routes?|endpoints?|dashboards?|portals?|streams?|workflows?|clients?)\b[\s\S]*)\.$/i,
          replace: `$1 ${prep} {kw}.`,
          score: 92,
          reason: `Integrated ${label} protocol/security context into existing web/API workflow`,
        },
      ],
      suffixes: [
        {
          suffix: ` ${prep} {kw}`,
          score: 88,
          reason: `Paired ${label} with existing service bullet`,
          contexts: ["backend", "frontend", "infra"],
        },
      ],
    };
  }

  if (
    id === "html" ||
    id === "css" ||
    id === "javascript" ||
    id === "typescript" ||
    id === "next_js" ||
    id === "redux" ||
    id === "react"
  ) {
    return {
      contexts: ["frontend", "backend"],
      pairsWith: ["React", "Next.js", "TypeScript", "JavaScript", "Tailwind CSS", "REST APIs", "HTML", "CSS"],
      rules: [
        {
          find: /\b\*\*TypeScript, Next\.js, React\*\*/i,
          replace: "**TypeScript, Next.js, React**, and {kw}",
          score: 96,
          reason: `Appended ${label} directly to existing frontend stack list`,
          contexts: ["frontend"],
        },
        {
          find: /(\b(?:dashboards?|portals?|views?|UI|React|Next\.js|TypeScript|REST APIs)\b[\s\S]*)\.$/i,
          replace: "$1 using {kw}.",
          score: 92,
          reason: `Paired ${label} with existing web application work`,
          contexts: ["frontend", "backend"],
        },
      ],
      suffixes: [
        {
          suffix: " using {kw}",
          score: 88,
          reason: `Paired ${label} with existing web stack`,
          contexts: ["frontend", "backend"],
        },
      ],
    };
  }

  if (id === "fastapi" || id === "flask" || id === "node_js" || id === "express" || id === "git" || id === "postman") {
    return {
      contexts: ["backend", "infra", "frontend"],
      pairsWith: ["Python", "FastAPI", "Flask", "TypeScript", "JavaScript", "REST APIs", "PostgreSQL", "Supabase", "Firebase"],
      rules: [
        {
          find: /(\b(?:APIs?|services?|endpoints?|routes?|dashboards?|pipelines?|agents?|backend)\b[\s\S]*)\.$/i,
          replace: "$1 using {kw}.",
          score: 92,
          reason: `Paired ${label} with existing backend/service bullet`,
          contexts: ["backend", "infra", "frontend"],
        },
      ],
      suffixes: [
        {
          suffix: " using {kw}",
          score: 88,
          reason: `Paired ${label} with existing engineering workflow`,
          contexts: ["backend", "infra", "frontend"],
        },
      ],
    };
  }

  if (
    id === "opencv" ||
    id === "pandas" ||
    id === "numpy" ||
    id === "scikit_learn" ||
    id === "tensorflow" ||
    id === "langchain" ||
    id === "hugging_face" ||
    id === "llama_cpp" ||
    id === "llm" ||
    id === "machine_learning" ||
    id === "computer_vision" ||
    id === "ros_2" ||
    id === "gazebo"
  ) {
    const isRobotics = id === "ros_2" || id === "gazebo" || id === "opencv" || id === "computer_vision";
    const contexts: Context[] = isRobotics ? ["systems", "ml"] : ["ml", "backend"];
    return {
      contexts,
      pairsWith: ["Python", "PyTorch", "SAM 2", "VLM", "LLM", "Optuna", "C++", "ROS 2", "Gazebo", "LiDAR", "FastAPI"],
      rules: [
        {
          find: /(\b(?:models?|detectors?|annotation|images|pipeline|LLM|PyTorch|Python|VLM|SAM\s*2|mapping|planning|LiDAR|accuracy)\b[\s\S]*)\.$/i,
          replace: "$1 with {kw}.",
          score: 92,
          reason: `Integrated ${label} directly into existing ML/vision/autonomy pipeline`,
          contexts,
        },
      ],
      suffixes: [
        {
          suffix: " with {kw}",
          score: 88,
          reason: `Paired ${label} with existing ML/systems workflow`,
          contexts,
        },
      ],
    };
  }

  const defaultContexts: Context[] =
    skillsCategory === "Frameworks & Libraries"
      ? ["frontend", "backend", "ml"]
      : skillsCategory === "Databases & Cloud"
      ? ["backend", "infra"]
      : skillsCategory === "Languages"
      ? ["backend", "systems", "frontend"]
      : ["infra", "backend", "systems"];

  return {
    contexts: defaultContexts,
    pairsWith: ["Python", "TypeScript", "C++", "PostgreSQL", "REST APIs", "FastAPI", "Flask", "Linux", "Docker"],
    rules: [
      {
        find: /(\b(?:APIs?|services?|endpoints?|pipelines?|workflows?|systems?|models?|dashboards?|portals?)\b[\s\S]*)\.$/i,
        replace: "$1 with {kw}.",
        score: 91,
        reason: `Added ${label} context to matched engineering bullet`,
        contexts: defaultContexts,
      },
    ],
    suffixes: [
      {
        suffix: " with {kw}",
        score: 87,
        reason: `Paired ${label} with existing workflow`,
        contexts: defaultContexts,
      },
    ],
  };
}

/**
 * Returns additional natural rewrite rules used only in focused recommendation mode
 * (so legacy v1 golden snapshots remain 100% unchanged).
 */
export function getFocusedFallbackRulesForEntry(entry: CatalogEntry): RewriteRuleSpec[] {
  const idLower = entry.id.toLowerCase();
  if (idLower === "agile") {
    return [
      {
        find: /(\b(?:Implemented|Engineered|Built|Developed|Shipped|Automated|Designed|Trained|Handled|Gave|Processed|Created|Architected|Configured|Added)\b[\s\S]*)\.$/i,
        replace: "$1 in {kw} sprints.",
        score: 94,
        reason: "Added Agile sprint delivery framing to existing engineering work",
        contexts: ["frontend", "backend", "infra", "systems", "ml"],
      },
    ];
  }
  if (idLower === "ci_cd") {
    return [
      {
        find: /(\b(?:services?|APIs?|pipelines?|workflows?|builds?|clusters?|planning|simulation)\b[\s\S]*)\.$/i,
        replace: "$1 with automated {kw}.",
        score: 94,
        reason: "Added automated CI/CD verification context to existing engineering bullet",
        contexts: ["infra", "backend", "systems"],
      },
    ];
  }
  if (idLower === "jira" || idLower === "linear") {
    return [
      {
        find: /(\b(?:Implemented|Engineered|Built|Developed|Shipped|Automated|Designed|Trained|Handled|Gave|Processed|Created|Architected|Configured|Added)\b[\s\S]*)\.$/i,
        replace: "$1, tracked in {kw}.",
        score: 91,
        reason: `Added ${entry.label} sprint/issue tracking context`,
        contexts: ["frontend", "backend", "infra", "systems"],
      },
    ];
  }
  return [];
}

/**
 * Returns focused-mode injection metadata (contexts, pairsWith, rules, suffixes) for any
 * entry that did not define explicit v1 rewrite rules, keeping legacy v1 snapshots 100% unchanged.
 */
export function getFocusedInjectionSpecForEntry(
  entry: CatalogEntry
): Pick<CatalogEntry, "contexts" | "pairsWith" | "rules" | "suffixes"> {
  const defaultSpec = buildDefaultInjectionSpecForTech(
    entry.id,
    entry.label,
    entry.skillsCategory
  );
  const extraRules = getFocusedFallbackRulesForEntry(entry);
  return {
    contexts: entry.contexts ?? defaultSpec.contexts,
    pairsWith: entry.pairsWith ?? defaultSpec.pairsWith,
    rules:
      extraRules.length > 0
        ? [...extraRules, ...(entry.rules ?? [])]
        : entry.rules ?? defaultSpec.rules,
    suffixes: entry.suffixes ?? defaultSpec.suffixes,
  };
}

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
    const injectionSpec = buildDefaultInjectionSpecForTech(id, dictEntry.name, skillsCategory);

    seenIds.add(id);
    extended.push({
      id,
      label: dictEntry.name,
      name: dictEntry.name,
      aliases: dictEntry.aliases,
      weakAliases: dictEntry.weakAliases,
      tier,
      defaultTierIfMissing: tier,
      skillsCategory,
      targetSkillCategory: skillsCategory,
      contexts: injectionSpec.contexts,
      pairsWith: injectionSpec.pairsWith,
      rules: injectionSpec.rules,
      suffixes: injectionSpec.suffixes,
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
