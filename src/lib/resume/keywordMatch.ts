import type { MasterResume } from "./types";
import { escapeRegExp, plainText, splitItems } from "./utils";

export interface KeywordMatchItem {
  /** Canonical display name of the technology/skill/tool */
  name: string;
  /** Category of the keyword */
  category:
    | "Languages"
    | "Frameworks & Libraries"
    | "Databases & Cloud"
    | "Tools & Infrastructure"
    | "Core Engineering";
  /** True if found on the user's MasterResume */
  matched: boolean;
  /** Sections of the resume where this keyword was found */
  foundIn: ("skills" | "experience" | "projects")[];
  /** Computed importance weight (required 1.0, general 0.7, preferred 0.4 + repetition + title bonuses, halved if only weak alias matched) */
  weight?: number;
  /** Section where the keyword first or most strongly appeared */
  section?: "required" | "preferred" | "general";
}

export interface MinimumQualificationsResult {
  heading: string;
  items: string[];
}

export interface KeywordMatchResult {
  totalDetected: number;
  matchedCount: number;
  missingCount: number;
  scorePercent: number;
  weightedScorePercent?: number;
  matched: KeywordMatchItem[];
  missing: KeywordMatchItem[];
  unknownTerms?: string[];
  minimumQualifications?: MinimumQualificationsResult | null;
}

export interface TechEntry {
  name: string;
  category: KeywordMatchItem["category"];
  aliases: string[];
  weakAliases?: string[];
}

/**
 * Ambiguous short or common English words that require case-sensitivity AND a tech delimiter or context word nearby.
 */
export const AMBIGUOUS_ALIASES = new Set([
  "go",
  "r",
  "c",
  "ts",
  "js",
  "sh",
  "ml",
  "cv",
  "rag",
  "sso",
  "rest",
  "apis",
  "node",
  "spring",
  "swift",
  "rails",
  "torch",
]);

/**
 * Over-broad aliases that only count at half weight (0.5x) when matched without a strong primary alias.
 */
export const WEAK_ALIASES = new Set([
  "containers",
  "containerization",
  "authentication",
  "perception",
  "consensus",
  "github",
  "s3",
  "lambda",
  "ec2",
  "transformers",
]);

/**
 * Curated engineering dictionary of languages, frameworks, cloud/databases, devops tools, and core concepts.
 */
export const TECH_DICTIONARY: TechEntry[] = [
  // Languages
  { name: "Python", category: "Languages", aliases: ["python", "python3"] },
  { name: "C++", category: "Languages", aliases: ["c++", "c++17", "c++20", "c++23", "cpp"] },
  { name: "C", category: "Languages", aliases: ["c", "ansi c", "embedded c"] },
  { name: "C#", category: "Languages", aliases: ["c#", "csharp", ".net c#"] },
  { name: "Java", category: "Languages", aliases: ["java"] },
  { name: "TypeScript", category: "Languages", aliases: ["typescript", "ts"] },
  { name: "JavaScript", category: "Languages", aliases: ["javascript", "js", "es6", "ecmascript"] },
  { name: "Go", category: "Languages", aliases: ["go", "golang"] },
  { name: "Rust", category: "Languages", aliases: ["rust", "rustlang"] },
  { name: "SQL", category: "Languages", aliases: ["sql", "t-sql", "pl/sql"] },
  { name: "NoSQL", category: "Languages", aliases: ["nosql"] },
  { name: "HTML", category: "Languages", aliases: ["html", "html5"] },
  { name: "CSS", category: "Languages", aliases: ["css", "css3"] },
  { name: "Bash", category: "Languages", aliases: ["bash", "shell", "shell scripting", "zsh", "sh"] },
  { name: "Swift", category: "Languages", aliases: ["swift"] },
  { name: "Kotlin", category: "Languages", aliases: ["kotlin"] },
  { name: "Ruby", category: "Languages", aliases: ["ruby"] },
  { name: "PHP", category: "Languages", aliases: ["php"] },
  { name: "Scala", category: "Languages", aliases: ["scala"] },
  { name: "R", category: "Languages", aliases: ["r"] },
  { name: "MATLAB", category: "Languages", aliases: ["matlab", "simulink"] },
  { name: "Dart", category: "Languages", aliases: ["dart"] },
  { name: "CUDA", category: "Languages", aliases: ["cuda"] },
  { name: "Verilog", category: "Languages", aliases: ["verilog", "systemverilog", "vhdl"] },
  { name: "Assembly", category: "Languages", aliases: ["assembly", "x86", "arm assembly"] },

  // Frameworks & Libraries
  { name: "React", category: "Frameworks & Libraries", aliases: ["react", "react.js", "reactjs"] },
  { name: "Next.js", category: "Frameworks & Libraries", aliases: ["next.js", "nextjs"] },
  { name: "Node.js", category: "Frameworks & Libraries", aliases: ["node.js", "nodejs", "node"] },
  { name: "Express", category: "Frameworks & Libraries", aliases: ["express", "express.js", "expressjs"] },
  { name: "Vue.js", category: "Frameworks & Libraries", aliases: ["vue", "vue.js", "vuejs"] },
  { name: "Angular", category: "Frameworks & Libraries", aliases: ["angular", "angularjs"] },
  { name: "Svelte", category: "Frameworks & Libraries", aliases: ["svelte", "sveltekit"] },
  { name: "Tailwind CSS", category: "Frameworks & Libraries", aliases: ["tailwind", "tailwind css", "tailwindcss"] },
  { name: "Redux", category: "Frameworks & Libraries", aliases: ["redux", "redux toolkit"] },
  { name: "React Native", category: "Frameworks & Libraries", aliases: ["react native"] },
  { name: "Flutter", category: "Frameworks & Libraries", aliases: ["flutter"] },
  { name: "FastAPI", category: "Frameworks & Libraries", aliases: ["fastapi"] },
  { name: "Flask", category: "Frameworks & Libraries", aliases: ["flask"] },
  { name: "Django", category: "Frameworks & Libraries", aliases: ["django"] },
  { name: "Spring Boot", category: "Frameworks & Libraries", aliases: ["spring boot", "spring", "spring framework"] },
  { name: ".NET", category: "Frameworks & Libraries", aliases: [".net", "asp.net", ".net core", "dotnet"] },
  { name: "Ruby on Rails", category: "Frameworks & Libraries", aliases: ["ruby on rails", "rails"] },
  { name: "NestJS", category: "Frameworks & Libraries", aliases: ["nestjs"] },
  { name: "GraphQL", category: "Frameworks & Libraries", aliases: ["graphql"] },
  { name: "gRPC", category: "Frameworks & Libraries", aliases: ["grpc", "protobuf", "protocol buffers"] },
  { name: "PyTorch", category: "Frameworks & Libraries", aliases: ["pytorch", "torch"] },
  { name: "TensorFlow", category: "Frameworks & Libraries", aliases: ["tensorflow", "keras"] },
  { name: "Scikit-learn", category: "Frameworks & Libraries", aliases: ["scikit-learn", "sklearn"] },
  { name: "Pandas", category: "Frameworks & Libraries", aliases: ["pandas"] },
  { name: "NumPy", category: "Frameworks & Libraries", aliases: ["numpy"] },
  { name: "OpenCV", category: "Frameworks & Libraries", aliases: ["opencv"] },
  { name: "LangChain", category: "Frameworks & Libraries", aliases: ["langchain", "llamaindex"] },
  { name: "Hugging Face", category: "Frameworks & Libraries", aliases: ["hugging face", "huggingface"], weakAliases: ["transformers"] },
  { name: "llama.cpp", category: "Frameworks & Libraries", aliases: ["llama.cpp", "vllm", "onnx", "tensorrt"] },
  { name: "Qt", category: "Frameworks & Libraries", aliases: ["qt", "qt5", "qt6"] },
  { name: "ROS 2", category: "Frameworks & Libraries", aliases: ["ros", "ros 2", "ros2"] },
  { name: "Spark", category: "Frameworks & Libraries", aliases: ["spark", "apache spark", "pyspark"] },

  // Databases & Cloud
  { name: "PostgreSQL", category: "Databases & Cloud", aliases: ["postgresql", "postgres"] },
  { name: "MySQL", category: "Databases & Cloud", aliases: ["mysql", "mariadb"] },
  { name: "SQLite", category: "Databases & Cloud", aliases: ["sqlite", "sqlite3"] },
  { name: "MongoDB", category: "Databases & Cloud", aliases: ["mongodb", "mongo"] },
  { name: "Redis", category: "Databases & Cloud", aliases: ["redis"] },
  { name: "DynamoDB", category: "Databases & Cloud", aliases: ["dynamodb"] },
  { name: "Cassandra", category: "Databases & Cloud", aliases: ["cassandra"] },
  { name: "Elasticsearch", category: "Databases & Cloud", aliases: ["elasticsearch", "opensearch"] },
  { name: "Firebase", category: "Databases & Cloud", aliases: ["firebase", "firestore", "firebase cloud functions"] },
  { name: "Supabase", category: "Databases & Cloud", aliases: ["supabase"] },
  { name: "Snowflake", category: "Databases & Cloud", aliases: ["snowflake"] },
  { name: "BigQuery", category: "Databases & Cloud", aliases: ["bigquery"] },
  { name: "AWS", category: "Databases & Cloud", aliases: ["aws", "amazon web services", "eks", "ecs", "rds", "sqs", "sns"], weakAliases: ["ec2", "s3", "lambda"] },
  { name: "GCP", category: "Databases & Cloud", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { name: "Azure", category: "Databases & Cloud", aliases: ["azure", "microsoft azure"] },
  { name: "Vercel", category: "Databases & Cloud", aliases: ["vercel"] },

  // Tools & Infrastructure
  { name: "Docker", category: "Tools & Infrastructure", aliases: ["docker", "docker compose", "dockerfile"], weakAliases: ["containerization", "containers"] },
  { name: "Kubernetes", category: "Tools & Infrastructure", aliases: ["kubernetes", "k8s", "helm"] },
  { name: "Git", category: "Tools & Infrastructure", aliases: ["git", "gitlab", "bitbucket"], weakAliases: ["github"] },
  { name: "GitHub Actions", category: "Tools & Infrastructure", aliases: ["github actions"] },
  { name: "CI/CD", category: "Tools & Infrastructure", aliases: ["ci/cd", "ci cd", "continuous integration", "continuous deployment", "jenkins", "gitlab ci", "circleci"] },
  { name: "Terraform", category: "Tools & Infrastructure", aliases: ["terraform", "iac", "infrastructure as code", "ansible", "pulumi"] },
  { name: "Linux", category: "Tools & Infrastructure", aliases: ["linux", "unix", "ubuntu", "debian", "posix"] },
  { name: "Kafka", category: "Tools & Infrastructure", aliases: ["kafka", "apache kafka", "rabbitmq"] },
  { name: "Airflow", category: "Tools & Infrastructure", aliases: ["airflow", "apache airflow", "dbt"] },
  { name: "Prometheus", category: "Tools & Infrastructure", aliases: ["prometheus", "grafana", "datadog", "opentelemetry", "splunk", "sentry"] },
  { name: "CMake", category: "Tools & Infrastructure", aliases: ["cmake", "makefile", "gradle", "maven", "bazel"] },
  { name: "Gazebo", category: "Tools & Infrastructure", aliases: ["gazebo", "foxglove", "foxglove studio"] },
  { name: "Jira", category: "Tools & Infrastructure", aliases: ["jira", "linear", "confluence"] },
  { name: "Jest", category: "Tools & Infrastructure", aliases: ["jest", "vitest", "pytest", "junit", "cypress", "playwright", "selenium"] },
  { name: "Twilio", category: "Tools & Infrastructure", aliases: ["twilio"] },
  { name: "Stripe", category: "Tools & Infrastructure", aliases: ["stripe"] },

  // Core Engineering & APIs
  { name: "REST APIs", category: "Core Engineering", aliases: ["rest", "rest api", "rest apis", "restful", "restful api", "restful apis", "apis"] },
  { name: "WebSockets", category: "Core Engineering", aliases: ["websocket", "websockets", "socket.io"] },
  { name: "Microservices", category: "Core Engineering", aliases: ["microservice", "microservices"] },
  { name: "Distributed Systems", category: "Core Engineering", aliases: ["distributed systems", "distributed system", "raft"], weakAliases: ["consensus"] },
  { name: "LLM", category: "Core Engineering", aliases: ["llm", "llms", "large language model", "large language models", "genai", "generative ai", "rag", "prompt engineering"] },
  { name: "Machine Learning", category: "Core Engineering", aliases: ["machine learning", "ml", "deep learning", "neural networks"] },
  { name: "Computer Vision", category: "Core Engineering", aliases: ["computer vision", "cv", "lidar", "sensor fusion", "slam"], weakAliases: ["perception"] },
  { name: "OAuth", category: "Core Engineering", aliases: ["oauth", "oauth 2.0", "oauth2", "jwt", "sso"], weakAliases: ["authentication"] },
  { name: "Agile", category: "Core Engineering", aliases: ["agile", "scrum", "kanban"] },
  { name: "Unit Testing", category: "Core Engineering", aliases: ["unit test", "unit tests", "unit testing", "integration testing", "tdd"] },
];

const CANONICAL_CASE_FOR_AMBIGUOUS: Record<string, string[]> = {
  go: ["Go"],
  r: ["R"],
  c: ["C"],
  ts: ["TS"],
  js: ["JS"],
  sh: ["sh", "SH"],
  ml: ["ML"],
  cv: ["CV"],
  rag: ["RAG"],
  sso: ["SSO"],
  rest: ["REST"],
  apis: ["APIs", "API"],
  node: ["Node"],
  spring: ["Spring"],
  swift: ["Swift"],
  rails: ["Rails"],
  torch: ["Torch", "PyTorch"],
};

const TECH_CONTEXT_NEARBY =
  /(?:[,/|()[\]•·:]|\b(?:using|with|in|experience|proficiency|skills?|stack|languages?|frameworks?|tools?|backend|frontend|mobile|services?|endpoints?|programming|written|such\s+as|like|and|or)\b)/i;

const FALSE_POSITIVE_PHRASES: Record<string, RegExp[]> = {
  go: [/\bgo\s+to\b/i, /\bgo\s+above\b/i, /\bgo\s+beyond\b/i, /\bgo\s+live\b/i, /\bon\s+the\s+go\b/i],
  rest: [/\brest\s+of\b/i, /\bthe\s+rest\b/i, /\bat\s+rest\b/i],
  swift: [/\bswift\s+(?:action|response|delivery|pace|resolution)\b/i],
  spring: [/\bspring\s+20\d\d\b/i, /\bspring\s+(?:semester|term|intern|internship|co-op)\b/i],
};

/**
 * Checks whether a given alias token appears as a valid technical term in `haystack`.
 * Enforces case-sensitivity and nearby technical context for `AMBIGUOUS_ALIASES`.
 */
export function containsToken(haystack: string, token: string, isResumeCorpus = false): boolean {
  const clean = token.trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();

  if (!isResumeCorpus && AMBIGUOUS_ALIASES.has(lower)) {
    const falsePositives = FALSE_POSITIVE_PHRASES[lower];
    let scrubbed = haystack;
    if (falsePositives) {
      for (const fp of falsePositives) {
        scrubbed = scrubbed.replace(new RegExp(fp.source, "gi"), " ");
      }
    }

    const allowedCases = CANONICAL_CASE_FOR_AMBIGUOUS[lower] ?? [clean];
    for (const cased of allowedCases) {
      const re = new RegExp(
        `(?<![A-Za-z0-9+#.])${escapeRegExp(cased)}(?![A-Za-z0-9+#])`,
        "g"
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(scrubbed)) !== null) {
        const start = Math.max(0, m.index - 28);
        const end = Math.min(scrubbed.length, m.index + cased.length + 28);
        const windowStr =
          scrubbed.slice(start, m.index) + " " + scrubbed.slice(m.index + cased.length, end);
        if (TECH_CONTEXT_NEARBY.test(windowStr)) {
          return true;
        }
      }
    }
    return false;
  }

  const re = new RegExp(
    `(?<![A-Za-z0-9+#.])${escapeRegExp(clean)}(?![A-Za-z0-9+#])`,
    "i"
  );
  return re.test(haystack);
}

export function countTokenMentions(haystack: string, aliases: string[]): number {
  let count = 0;
  for (const alias of aliases) {
    const clean = alias.trim();
    if (!clean) continue;
    if (!containsToken(haystack, clean)) continue;
    const re = new RegExp(
      `(?<![A-Za-z0-9+#.])${escapeRegExp(clean)}(?![A-Za-z0-9+#])`,
      AMBIGUOUS_ALIASES.has(clean.toLowerCase()) ? "g" : "gi"
    );
    const matches = haystack.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

export interface JdSegments {
  titleLine: string;
  requiredSection: string;
  preferredSection: string;
  generalSection: string;
}

export function segmentJobDescription(jd: string): JdSegments {
  const lines = jd.trim().split(/\r?\n/);
  const titleLine = lines[0] ?? "";

  const reqHeadingRe =
    /(?:^|\n)[ \t]*(?:#+\s*)?(minimum\s+qualifications?|basic\s+qualifications?|required\s+qualifications?|minimum\s+requirements?|minimum\s+experience|what\s+you(?:'ll|\s+will)?\s+need|must\s+haves?|key\s+qualifications?|qualifications?|requirements?(?:\s*&\s*tech\s+stack)?)[ \t]*:?[ \t]*(?:\r?\n|$)/i;
  const prefHeadingRe =
    /(?:^|\n)[ \t]*(?:#+\s*)?(preferred\s+qualifications?|preferred\s+requirements?|nice\s+to\s+haves?|bonus\s+points?|bonus\s+qualifications?)[ \t]*:?[ \t]*(?:\r?\n|$)/i;

  const reqMatch = reqHeadingRe.exec(jd);
  const prefMatch = prefHeadingRe.exec(jd);

  if (!reqMatch && !prefMatch) {
    return {
      titleLine,
      requiredSection: "",
      preferredSection: "",
      generalSection: jd,
    };
  }

  let requiredSection = "";
  let preferredSection = "";
  let generalSection = "";

  if (reqMatch && prefMatch) {
    if (reqMatch.index < prefMatch.index) {
      generalSection = jd.slice(0, reqMatch.index);
      requiredSection = jd.slice(reqMatch.index, prefMatch.index);
      preferredSection = jd.slice(prefMatch.index);
    } else {
      generalSection = jd.slice(0, prefMatch.index);
      preferredSection = jd.slice(prefMatch.index, reqMatch.index);
      requiredSection = jd.slice(reqMatch.index);
    }
  } else if (reqMatch) {
    generalSection = jd.slice(0, reqMatch.index);
    requiredSection = jd.slice(reqMatch.index);
  } else if (prefMatch) {
    generalSection = jd.slice(0, prefMatch.index);
    preferredSection = jd.slice(prefMatch.index);
  }

  return {
    titleLine,
    requiredSection,
    preferredSection,
    generalSection,
  };
}

function mapResumeCategoryNameToDictCategory(
  catName: string
): KeywordMatchItem["category"] {
  const upper = catName.toUpperCase();
  if (/LANGUAGE/.test(upper)) return "Languages";
  if (/FRAMEWORK|LIBRAR/.test(upper)) return "Frameworks & Libraries";
  if (/DATABASE|CLOUD|DATA|STORAGE/.test(upper)) return "Databases & Cloud";
  if (/CORE|CONCEPT|API/.test(upper)) return "Core Engineering";
  return "Tools & Infrastructure";
}

const COMMON_ENGLISH_CAPITALIZED = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "what", "who",
  "about", "role", "team", "company", "experience", "requirements", "qualifications",
  "minimum", "preferred", "basic", "bonus", "points", "nice", "have", "strong",
  "proficiency", "hands", "comfortable", "familiarity", "deep", "expertise",
  "building", "software", "engineer", "engineering", "product", "platform",
  "backend", "frontend", "full", "stack", "infrastructure", "machine", "learning",
  "join", "work", "working", "design", "systems", "services", "high", "modern",
  "customer", "support", "account", "intelligence", "core", "organization",
  "distributed", "deploying", "querying", "caching", "tracking", "issues",
  "sprints", "workflows", "ownership", "features", "shipping", "clients",
  "mobile", "web", "developer", "experiences", "scale", "multimodal", "evaluation",
  "programming", "skills", "containerizing", "workloads", "pipelines", "reliability",
]);

/**
 * Surfaces capitalized or camelCase technical terms in the JD that aren't in the catalog.
 */
export function extractUnknownTechnicalTerms(
  jdText: string,
  knownAliasesLower: Set<string>
): string[] {
  const unknown = new Set<string>();
  const tokens = jdText.match(/\b(?:[A-Z][a-z0-9]+(?:[A-Z][a-zA-Z0-9]*)+|[A-Z]{2,}[0-9]*|[A-Z][a-z0-9]+\.(?:js|ts|py|io|ai|cpp))\b/g) ?? [];

  for (const tok of tokens) {
    const clean = tok.trim();
    const lower = clean.toLowerCase();
    if (clean.length < 2) continue;
    if (knownAliasesLower.has(lower)) continue;
    if (COMMON_ENGLISH_CAPITALIZED.has(lower)) continue;
    unknown.add(clean);
  }

  return Array.from(unknown);
}

/**
 * Analyzes a Job Description against a candidate's `MasterResume` and returns
 * matched and missing technologies, skills, and tools with weighted coverage.
 */
export function matchJobDescriptionWithResume(
  jobDescription: string,
  resume: MasterResume
): KeywordMatchResult {
  const jdText = jobDescription.trim();
  if (!jdText) {
    return {
      totalDetected: 0,
      matchedCount: 0,
      missingCount: 0,
      scorePercent: 0,
      weightedScorePercent: 0,
      matched: [],
      missing: [],
      unknownTerms: [],
    };
  }

  const segments = segmentJobDescription(jdText);

  const skillsCorpus = [
    ...resume.skills.map((c) => `${c.name} ${c.skills.map((s) => s.name).join(" ")}`),
    ...resume.skills.flatMap((c) => c.skills.flatMap((s) => splitItems(s.name))),
  ].join(" \n ");

  const experienceCorpus = resume.experience
    .map(
      (j) =>
        `${j.title} ${j.company} ${j.bullets.map((b) => plainText(b.text)).join(" ")} ${j.bullets
          .flatMap((b) => b.tools)
          .join(" ")}`
    )
    .join(" \n ");

  const projectsCorpus = resume.projects
    .map(
      (p) =>
        `${p.name} ${p.techStack.join(" ")} ${p.bullets
          .map((b) => plainText(b.text))
          .join(" ")} ${p.bullets.flatMap((b) => b.tools).join(" ")}`
    )
    .join(" \n ");

  const dictionaryNamesLower = new Set(
    TECH_DICTIONARY.flatMap((e) => [
      e.name.toLowerCase(),
      ...e.aliases.map((a) => a.toLowerCase()),
      ...(e.weakAliases ?? []).map((a) => a.toLowerCase()),
    ])
  );

  // Dynamic resume entries take their category from the skills section they came from
  const dynamicEntries: TechEntry[] = [];
  for (const cat of resume.skills) {
    const mappedCategory = mapResumeCategoryNameToDictCategory(cat.name);
    for (const s of cat.skills) {
      for (const item of splitItems(s.name)) {
        const clean = item.trim();
        if (clean.length < 2) continue;
        if (dictionaryNamesLower.has(clean.toLowerCase())) continue;
        dictionaryNamesLower.add(clean.toLowerCase());
        dynamicEntries.push({
          name: clean,
          category: mappedCategory,
          aliases: [clean.toLowerCase()],
        });
      }
    }
  }

  for (const p of resume.projects) {
    for (const t of p.techStack) {
      for (const item of splitItems(t)) {
        const clean = item.trim();
        if (clean.length < 2) continue;
        if (dictionaryNamesLower.has(clean.toLowerCase())) continue;
        dictionaryNamesLower.add(clean.toLowerCase());
        dynamicEntries.push({
          name: clean,
          category: "Tools & Infrastructure",
          aliases: [clean.toLowerCase()],
        });
      }
    }
  }

  const allEntries = [...TECH_DICTIONARY, ...dynamicEntries];
  const matched: KeywordMatchItem[] = [];
  const missing: KeywordMatchItem[] = [];

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const entry of allEntries) {
    const strongHit = entry.aliases.some((alias) => containsToken(jdText, alias, false));
    const weakHit =
      !strongHit &&
      (entry.weakAliases ?? []).some((alias) => containsToken(jdText, alias, false));

    if (!strongHit && !weakHit) continue;

    const allAliases = [...entry.aliases, ...(entry.weakAliases ?? [])];
    const inReq = allAliases.some((a) => containsToken(segments.requiredSection, a, false));
    const inGen = allAliases.some((a) => containsToken(segments.generalSection, a, false));
    const inPref = allAliases.some((a) => containsToken(segments.preferredSection, a, false));

    let section: "required" | "preferred" | "general" = "general";
    let baseWeight = 0.7;
    if (inReq) {
      section = "required";
      baseWeight = 1.0;
    } else if (inGen) {
      section = "general";
      baseWeight = 0.7;
    } else if (inPref) {
      section = "preferred";
      baseWeight = 0.4;
    }

    const mentions = countTokenMentions(jdText, allAliases);
    const repeatBonus = Math.min(0.3, Math.max(0, (mentions - 1) * 0.1));
    const inTitle = allAliases.some((a) => containsToken(segments.titleLine, a, false));
    const titleBonus = inTitle ? 0.2 : 0;

    let weight = Number((baseWeight + repeatBonus + titleBonus).toFixed(2));
    if (weakHit) {
      weight = Number((weight * 0.5).toFixed(2));
    }

    const foundIn: ("skills" | "experience" | "projects")[] = [];
    if (allAliases.some((alias) => containsToken(skillsCorpus, alias, true))) {
      foundIn.push("skills");
    }
    if (allAliases.some((alias) => containsToken(experienceCorpus, alias, true))) {
      foundIn.push("experience");
    }
    if (allAliases.some((alias) => containsToken(projectsCorpus, alias, true))) {
      foundIn.push("projects");
    }

    const isMatched = foundIn.length > 0;
    const item: KeywordMatchItem = {
      name: entry.name,
      category: entry.category,
      matched: isMatched,
      foundIn,
      weight,
      section,
    };

    totalWeight += weight;
    if (isMatched) {
      matchedWeight += weight;
      matched.push(item);
    } else {
      missing.push(item);
    }
  }

  const totalDetected = matched.length + missing.length;
  const matchedCount = matched.length;
  const missingCount = missing.length;
  const scorePercent =
    totalDetected > 0 ? Math.round((matchedCount / totalDetected) * 100) : 0;
  const weightedScorePercent =
    totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

  return {
    totalDetected,
    matchedCount,
    missingCount,
    scorePercent,
    weightedScorePercent,
    matched,
    missing,
    unknownTerms: extractUnknownTechnicalTerms(jdText, dictionaryNamesLower),
    minimumQualifications: extractMinimumQualifications(jdText),
  };
}

/**
 * Extracts the minimum, basic, or required qualifications section from a raw job description text.
 */
export function extractMinimumQualifications(
  jd: string
): MinimumQualificationsResult | null {
  if (!jd || typeof jd !== "string") return null;

  const primaryPatterns = [
    /(?:^|\n)[ \t]*(?:#+\s*)?(minimum\s+qualifications?|basic\s+qualifications?|required\s+qualifications?|minimum\s+requirements?|minimum\s+experience)[ \t]*:?[ \t]*(?:\r?\n|$)/i,
    /(?:^|\n)[ \t]*(?:#+\s*)?(what\s+you(?:'ll|\s+will)?\s+need|must\s+haves?|who\s+you\s+are|key\s+qualifications?)[ \t]*:?[ \t]*(?:\r?\n|$)/i,
    /(?:^|\n)[ \t]*(?:#+\s*)?(qualifications?|requirements?)[ \t]*:?[ \t]*(?:\r?\n|$)/i,
  ];

  let match: RegExpExecArray | null = null;
  let matchedHeading = "";
  for (const pat of primaryPatterns) {
    match = pat.exec(jd);
    if (match) {
      matchedHeading = match[1].trim();
      break;
    }
  }

  if (!match) return null;

  const startIndex = match.index + match[0].length;
  const afterHeading = jd.slice(startIndex);

  const nextHeadingPattern =
    /(?:^|\n)[ \t]*(?:#+\s*)?(preferred\s+qualifications?|preferred\s+requirements?|nice\s+to\s+haves?|bonus\s+points?|bonus\s+qualifications?|responsibilities|what\s+you(?:'ll|\s+will)?\s+do|about\s+(?:the\s+role|the\s+team|the\s+job|us|our\s+team|company)|benefits|compensation|salary|how\s+to\s+apply|equal\s+opportunity)[ \t]*:?[ \t]*(?:\r?\n|$)/i;

  const nextMatch = nextHeadingPattern.exec(afterHeading);
  const sectionContent = nextMatch ? afterHeading.slice(0, nextMatch.index) : afterHeading;

  const lines = sectionContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];

  for (const line of lines) {
    const bulletMatch = /^(?:[•\-\*\u2022\u25E6\u2043\u2219·▪✓]|(?:\d+[\.\)]))\s*(.*)/.exec(line);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (text) items.push(text);
    } else if (items.length > 0 && !line.endsWith(":") && line.length > 0 && !/^[A-Z\s]{4,}:?$/.test(line)) {
      items[items.length - 1] += " " + line;
    } else if (line.length > 10 && !line.endsWith(":")) {
      items.push(line);
    }
  }

  if (items.length === 0) {
    const raw = sectionContent.trim();
    if (raw) items.push(raw);
  }

  if (items.length === 0) return null;

  const headingWords = matchedHeading
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  return {
    heading: headingWords.join(" "),
    items: items.slice(0, 15),
  };
}
