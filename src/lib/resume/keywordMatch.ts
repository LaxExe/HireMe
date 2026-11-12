import type { MasterResume } from "./types";
import { escapeRegExp, plainText, splitItems } from "./utils";

export interface KeywordMatchItem {
  /** Canonical display name of the technology/skill/tool */
  name: string;
  /** Category of the keyword */
  category: "Languages" | "Frameworks & Libraries" | "Databases & Cloud" | "Tools & Infrastructure" | "Core Engineering";
  /** True if found on the user's MasterResume */
  matched: boolean;
  /** Sections of the resume where this keyword was found */
  foundIn: ("skills" | "experience" | "projects")[];
}

export interface KeywordMatchResult {
  totalDetected: number;
  matchedCount: number;
  missingCount: number;
  scorePercent: number;
  matched: KeywordMatchItem[];
  missing: KeywordMatchItem[];
}

interface TechEntry {
  name: string;
  category: KeywordMatchItem["category"];
  aliases: string[];
}

/**
 * Curated engineering dictionary of languages, frameworks, cloud/databases, devops tools, and core concepts.
 */
const TECH_DICTIONARY: TechEntry[] = [
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
  { name: "Hugging Face", category: "Frameworks & Libraries", aliases: ["hugging face", "huggingface", "transformers"] },
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
  { name: "AWS", category: "Databases & Cloud", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda", "eks", "ecs", "rds", "sqs", "sns"] },
  { name: "GCP", category: "Databases & Cloud", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { name: "Azure", category: "Databases & Cloud", aliases: ["azure", "microsoft azure"] },
  { name: "Vercel", category: "Databases & Cloud", aliases: ["vercel"] },

  // Tools & Infrastructure
  { name: "Docker", category: "Tools & Infrastructure", aliases: ["docker", "docker compose", "dockerfile", "containerization", "containers"] },
  { name: "Kubernetes", category: "Tools & Infrastructure", aliases: ["kubernetes", "k8s", "helm"] },
  { name: "Git", category: "Tools & Infrastructure", aliases: ["git", "github", "gitlab", "bitbucket"] },
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
  { name: "Distributed Systems", category: "Core Engineering", aliases: ["distributed systems", "distributed system", "raft", "consensus"] },
  { name: "LLM", category: "Core Engineering", aliases: ["llm", "llms", "large language model", "large language models", "genai", "generative ai", "rag", "prompt engineering"] },
  { name: "Machine Learning", category: "Core Engineering", aliases: ["machine learning", "ml", "deep learning", "neural networks"] },
  { name: "Computer Vision", category: "Core Engineering", aliases: ["computer vision", "cv", "lidar", "sensor fusion", "slam", "perception"] },
  { name: "OAuth", category: "Core Engineering", aliases: ["oauth", "oauth 2.0", "oauth2", "jwt", "sso", "authentication"] },
  { name: "Agile", category: "Core Engineering", aliases: ["agile", "scrum", "kanban"] },
  { name: "Unit Testing", category: "Core Engineering", aliases: ["unit test", "unit tests", "unit testing", "integration testing", "tdd"] },
];

/**
 * Checks whether a given alias token appears as a distinct word/phrase in `haystack`.
 */
function containsToken(haystack: string, token: string): boolean {
  const clean = token.trim();
  if (!clean) return false;
  const re = new RegExp(
    `(?<![A-Za-z0-9+#.])${escapeRegExp(clean)}(?![A-Za-z0-9+#])`,
    "i"
  );
  return re.test(haystack);
}

/**
 * Analyzes a Job Description against a candidate's `MasterResume` and returns
 * matched and missing technologies, skills, and tools.
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
      matched: [],
      missing: [],
    };
  }

  // Build section corpora from the user's MasterResume
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

  // Also include any custom skills from the user's resume that aren't in TECH_DICTIONARY
  const dictionaryNamesLower = new Set(
    TECH_DICTIONARY.flatMap((e) => [e.name.toLowerCase(), ...e.aliases.map((a) => a.toLowerCase())])
  );

  const dynamicEntries: TechEntry[] = [];
  const rawResumeSkills = [
    ...resume.skills.flatMap((c) => c.skills.flatMap((s) => splitItems(s.name))),
    ...resume.projects.flatMap((p) => p.techStack.flatMap((t) => splitItems(t))),
  ];

  for (const s of rawResumeSkills) {
    const clean = s.trim();
    if (clean.length < 2) continue;
    if (dictionaryNamesLower.has(clean.toLowerCase())) continue;
    dictionaryNamesLower.add(clean.toLowerCase());
    dynamicEntries.push({
      name: clean,
      category: "Tools & Infrastructure",
      aliases: [clean.toLowerCase()],
    });
  }

  const allEntries = [...TECH_DICTIONARY, ...dynamicEntries];
  const matched: KeywordMatchItem[] = [];
  const missing: KeywordMatchItem[] = [];

  for (const entry of allEntries) {
    // Check if the Job Description mentions this technology or any of its aliases
    const inJd = entry.aliases.some((alias) => containsToken(jdText, alias));
    if (!inJd) continue;

    // Check where in the resume this technology or any of its aliases appears
    const foundIn: ("skills" | "experience" | "projects")[] = [];
    if (entry.aliases.some((alias) => containsToken(skillsCorpus, alias))) {
      foundIn.push("skills");
    }
    if (entry.aliases.some((alias) => containsToken(experienceCorpus, alias))) {
      foundIn.push("experience");
    }
    if (entry.aliases.some((alias) => containsToken(projectsCorpus, alias))) {
      foundIn.push("projects");
    }

    const isMatched = foundIn.length > 0;
    const item: KeywordMatchItem = {
      name: entry.name,
      category: entry.category,
      matched: isMatched,
      foundIn,
    };

    if (isMatched) {
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

  return {
    totalDetected,
    matchedCount,
    missingCount,
    scorePercent,
    matched,
    missing,
  };
}
