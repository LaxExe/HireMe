import { DEFAULT_CALIBRATION } from "../types";
import type { CatalogItem } from "./types";

export { DEFAULT_CALIBRATION };

export const SINGLE_LINE_NCU = 98.0;

export const NARROW_CHARS = new Set("iIlj1!|.,:;'`()[] ");
export const WIDE_CHARS = new Set("mMwW@%GHOQUD");
export const UPPER_CHARS = new Set("ABCEFKJLNPRSTVXYZ");

export const COMPRESSION_RULES: [RegExp, string][] = [
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

export const DOMAIN_HINTS = {
  systemsCppRobotics:
    /\b(?:CGEventTap|WH_KEYBOARD_LL|SymSpell|llama\.cpp|SmolLM2|Qt6|Win32|macOS desktop|ROS\s*2|LiDAR|Gazebo|Foxglove|Pure Pursuit|costmap|odometry|rover|sensor-fusion|Raft consensus|Write-Ahead Log)\b/i,
  frontendUi:
    /\b(?:React|Next\.js|dashboards?|UI|frontend|Tailwind|components|CSV\/Excel report)\b/i,
  cloudDeployInfra:
    /\b(?:deployed on|Firebase Cloud Functions|Docker|CI\/CD|GitHub Actions|serverless|container)\b/i,
  mlVision:
    /\b(?:Roboflow|Auto\s*Label|VLM|SAM\s*2|SAM\s*3|RF-DETR|bounding\s*box|IoU|annotation|mAP|computer\s*vision)\b/i,
  mlResearch:
    /\b(?:van der Heijden|surrogate|pore-network|redox|electrochemical|battery|Slurm|Optuna|SHAP|simulation)\b/i,
  voiceAi:
    /\b(?:Ally|ElevenLabs|voice\s*agents?|speech-to-text|WebSocket|FastAPI|client\s*website)\b/i,
  systemsRoboticsRole:
    /\b(?:ROS\s*2|Gazebo|LiDAR|Isaac\s*Sim|Pioneer|occupancy-grid|Theta\*|robot|autonomy|C\+\+)\b/i,
  fullstackBackendRole:
    /\b(?:React|Next\.js|REST|PostgreSQL|Supabase|FastAPI|Flask|Full\s*Stack|Backend)\b/i,
  systemsRoboticsProject:
    /\b(?:WATonomous|ROS\s*2|LiDAR|Gazebo|Isaac\s*Sim|Theta\*|Pioneer|robotics|autonomous)\b/i,
  mlVisionProject:
    /\b(?:Connect\s*4|PPO|PyTorch|ESP32|ElevenLabs|Physical\s*AI)\b/i,
  fullstackBackendProject:
    /\b(?:React|Next\.js|Flask|Supabase|PostgreSQL|REST|TypeScript)\b/i,
};

export const LARP_CATALOG: CatalogItem[] = [
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

export const PYLON_TEST_JD = `Pylon — Software Engineer (Full-Stack / B2B Support Platform)
We are building the modern B2B customer support and account intelligence platform.
Requirements & Tech Stack:
- Strong experience with React, TypeScript, Python, PostgreSQL, and REST APIs.
- Experience with Golang (Go) and Rust for high-throughput backend services.
- Experience querying GraphQL APIs, caching with Redis, and deploying on AWS (EC2, S3, Lambda).
- Comfortable with Agile workflows and tracking issues in Jira.`;
