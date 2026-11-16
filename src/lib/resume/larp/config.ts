import { DEFAULT_CALIBRATION } from "../types";
import type { Context } from "./types";

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

/**
 * Generic, resume-agnostic domain hints mapping keywords and stack signals to `Context[]` tags.
 */
export const DOMAIN_HINTS: Record<Exclude<Context, "general">, RegExp> = {
  systems:
    /\b(?:C\+\+|ROS\s*2|LiDAR|occupancy-grid|path\s*planning|costmap|odometry|rover|autonomy|robotics?|embedded|firmware|RTOS|Win32|Qt6|SymSpell|consensus|Write-Ahead\s*Log)\b/i,
  frontend:
    /\b(?:React|Next\.js|Vue|Angular|Svelte|Tailwind|dashboards?|UI|frontend|interface|components|CSS|HTML|design\s*system)\b/i,
  infra:
    /\b(?:deployed\s+on|Cloud\s+Functions|Docker|Kubernetes|CI\/CD|GitHub\s+Actions|Terraform|serverless|containers?|cluster|AWS|GCP|Azure)\b/i,
  ml:
    /\b(?:PyTorch|TensorFlow|OpenCV|VLM|detectors?|bounding[\s-]box|IoU|annotation|mAP|computer\s*vision|surrogate|Optuna|SHAP|neural|deep\s*learning|machine\s*learning|model\s*training|inference)\b/i,
  backend:
    /\b(?:REST|GraphQL|APIs?|PostgreSQL|Supabase|FastAPI|Flask|Express|Node\.js|Django|Spring|Redis|MongoDB|WebSockets?|Webhooks?|schemas?|services?|endpoints?|speech-to-text|voice\s*agents?)\b/i,
};

/**
 * Auto-tags a text + tech stack combination with `Context[]` tags based on `DOMAIN_HINTS`.
 */
export function inferDomainTags(text: string, stack: string[] = []): Context[] {
  const combined = `${text} ${stack.join(" ")}`;
  const tags: Context[] = [];

  if (DOMAIN_HINTS.systems.test(combined)) tags.push("systems");
  if (DOMAIN_HINTS.ml.test(combined)) tags.push("ml");
  if (DOMAIN_HINTS.frontend.test(combined)) tags.push("frontend");
  if (DOMAIN_HINTS.infra.test(combined)) tags.push("infra");
  if (DOMAIN_HINTS.backend.test(combined)) tags.push("backend");

  if (tags.length === 0) tags.push("general");
  return tags;
}

export const PYLON_TEST_JD = `Pylon — Software Engineer (Full-Stack / B2B Support Platform)
We are building the modern B2B customer support and account intelligence platform.
Requirements & Tech Stack:
- Strong experience with React, TypeScript, Python, PostgreSQL, and REST APIs.
- Experience with Golang (Go) and Rust for high-throughput backend services.
- Experience querying GraphQL APIs, caching with Redis, and deploying on AWS (EC2, S3, Lambda).
- Comfortable with Agile workflows and tracking issues in Jira.`;
