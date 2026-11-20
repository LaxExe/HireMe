import { markupToLatex } from "../latex";
import { bulletFit, plainText } from "../utils";
import { findCatalogEntry } from "./catalog";
import { DEFAULT_CALIBRATION, inferDomainTags } from "./config";
import { calculateDynamicBelievabilityScore } from "./scoring";
import { containsPhrase, computeVisualWidth, fitBulletToCalibratedLineArea } from "./text";
import type {
  ContainerCandidate,
  Context,
  LarpTierClassification,
  MalleableBulletOption,
  MalleableSynthesizedBullet,
  MasterResume,
} from "./types";

export interface SynthesizeMalleableOptions {
  focusedRecommendations?: boolean;
  jobDescription?: string;
  keywordWeights?: Map<string, number>;
  defaultPicksByCompanyKey?: Record<string, string>;
}

function primaryContextFromTags(tags: Context[]): Context {
  if (tags.includes("systems")) return "systems";
  if (tags.includes("ml")) return "ml";
  if (tags.includes("backend")) return "backend";
  if (tags.includes("frontend")) return "frontend";
  if (tags.includes("infra")) return "infra";
  return "general";
}

/**
 * Populates `tags: Context[]` on each job and project of a `MasterResume` if not already set.
 */
export function autoTagResumeContainers(resume: MasterResume): MasterResume {
  const cloned = structuredClone(resume);
  for (const job of cloned.experience) {
    if (!job.tags || job.tags.length === 0) {
      const bulletsText = job.bullets.map((b) => plainText(b.text)).join(" ");
      const tools = job.bullets.flatMap((b) => b.tools);
      job.tags = inferDomainTags(`${job.title} ${job.company} ${bulletsText}`, tools);
    }
  }
  for (const proj of cloned.projects) {
    if (!proj.tags || proj.tags.length === 0) {
      const bulletsText = proj.bullets.map((b) => plainText(b.text)).join(" ");
      proj.tags = inferDomainTags(`${proj.name} ${bulletsText}`, proj.techStack);
    }
  }
  return cloned;
}

/**
 * Selects all eligible candidate roles and projects from the resume so the user
 * can view and choose LARP proposals across multiple distinct experiences.
 */
export function selectEligibleContainersForMalleableLines(
  resume: MasterResume
): ContainerCandidate[] {
  const candidates: ContainerCandidate[] = [];

  resume.experience.forEach((job, idx) => {
    const bulletsText = job.bullets.map((b) => plainText(b.text)).join(" ");
    const techSignals = job.bullets.flatMap((b) => b.tools);
    const tags =
      job.tags && job.tags.length > 0
        ? job.tags
        : inferDomainTags(`${job.title} ${job.company} ${bulletsText}`, techSignals);
    const domain = primaryContextFromTags(tags);

    let baseScore = 85;
    if (domain !== "general") baseScore += 8;
    if (idx === 0) baseScore += 5;

    candidates.push({
      id: job.id,
      title: `${job.title} · ${job.company}`,
      kind: "experience",
      companyOrProjectName: job.company,
      roleOrProjectType: job.title,
      existingBullets: job.bullets.map((b) => plainText(b.text)),
      techSignals: Array.from(new Set(techSignals)).slice(0, 8),
      roleSummary: `${job.title} at ${job.company} (${job.dates || "recent role"})`,
      tags,
      domain,
      score: baseScore,
    });
  });

  for (const proj of resume.projects) {
    const bulletsText = proj.bullets.map((b) => plainText(b.text)).join(" ");
    const tags =
      proj.tags && proj.tags.length > 0
        ? proj.tags
        : inferDomainTags(`${proj.name} ${bulletsText}`, proj.techStack);
    const domain = primaryContextFromTags(tags);

    let baseScore = 80;
    if (proj.techStack.length > 0) baseScore += 6;

    candidates.push({
      id: proj.id,
      title: `${proj.name} (Project)`,
      kind: "project",
      companyOrProjectName: proj.name,
      roleOrProjectType: "Project",
      existingBullets: proj.bullets.map((b) => plainText(b.text)),
      techSignals: proj.techStack.slice(0, 8),
      roleSummary: `${proj.name} (${proj.techStack.slice(0, 4).join(", ")})`,
      tags,
      domain,
      score: baseScore,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function normalizeKey(raw: string): string {
  return (raw || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(
    plainText(a)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
  );
  const tokB = new Set(
    plainText(b)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
  );
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let inter = 0;
  for (const t of tokA) if (tokB.has(t)) inter++;
  return inter / (tokA.size + tokB.size - inter);
}

function fallbackDefaultPickForTarget(target: ContainerCandidate): string {
  const lower = `${target.techSignals.join(" ")} ${target.existingBullets.join(" ")}`.toLowerCase();
  if (target.tags.includes("systems")) {
    return "Authored modular **C++** simulation regression tests to verify node stability across builds.";
  }
  if (target.tags.includes("ml") && !target.tags.includes("frontend")) {
    return "Automated **Python** evaluation scripts and validation checks across benchmark pipeline runs.";
  }
  if (target.tags.includes("backend") && /\bfastapi\b/i.test(lower)) {
    return "Added **FastAPI** integration tests and structured error handling across backend endpoints.";
  }
  if (target.tags.includes("frontend") || /\b(?:typescript|react|next\.js)\b/i.test(lower)) {
    return "Built **TypeScript** integration tests and request validation guards across core API routes.";
  }
  return "Built automated integration tests and structured error handling across core production services.";
}

interface FocusedBulletCandidate {
  markup: string;
  explanation: string;
  keywords: string[];
}

function buildFocusedJdCandidatesForTarget(
  target: ContainerCandidate,
  tiers: LarpTierClassification,
  keywordWeights?: Map<string, number>,
  jdText = ""
): FocusedBulletCandidate[] {
  const combinedExisting = `${target.techSignals.join(" ")} ${target.existingBullets.join(" ")}`;
  const signalsLower = combinedExisting.toLowerCase();
  const jdLower = jdText.toLowerCase();
  const isSystemsTarget = target.tags.includes("systems");
  const hasFrontendSignals =
    target.tags.includes("frontend") || /\b(?:react|next\.js|typescript|css|ui|dashboard)\b/i.test(signalsLower);
  const hasMlSignals =
    target.tags.includes("ml") || /\b(?:pytorch|python|model|evaluation|vision|training)\b/i.test(signalsLower);
  const isFastApi = /\bfastapi\b/i.test(signalsLower);
  const isFlask = /\bflask\b/i.test(signalsLower);

  const pmTool =
    tiers.tier_0_workflow.find((k) => /^(?:Jira|Linear|Agile)$/i.test(k)) || "";

  // Collect framing + workflow terms sorted by JD importance weight
  const framingAndWorkflow = Array.from(
    new Set([...tiers.tier_1_framing, ...tiers.tier_0_workflow])
  ).sort(
    (a, b) =>
      (keywordWeights?.get(b.toLowerCase()) ?? 1) -
      (keywordWeights?.get(a.toLowerCase()) ?? 1)
  );

  // Filter out keywords implausible for this specific container
  const plausibleTargets = framingAndWorkflow.filter((kw) => {
    const kLower = kw.toLowerCase();
    const entry = findCatalogEntry(kw);
    if (isSystemsTarget && !/^(?:docker|ci\/cd|jira|linear|agile|end-to-end)$/i.test(kLower)) {
      return false;
    }
    if (entry?.contexts && !entry.contexts.some((c) => target.tags.includes(c))) {
      // Allow pairsWith overlap even if tag wasn't explicitly set
      const pairsHit = (entry.pairsWith ?? []).some((pw) =>
        containsPhrase(combinedExisting, pw)
      );
      if (!pairsHit) return false;
    }
    if (/tailwind/i.test(kLower) && !hasFrontendSignals) return false;
    return true;
  });

  const candidates: FocusedBulletCandidate[] = [];

  for (const kw of plausibleTargets) {
    const kLower = kw.toLowerCase();
    if (kLower === "redis") {
      candidates.push({
        markup:
          "Added **Redis** read-through caching for repeat backend queries to lower database read load.",
        explanation: `Directly targets **Redis** from the JD alongside your ${target.companyOrProjectName} backend stack.`,
        keywords: ["Redis"],
      });
    } else if (kLower === "graphql") {
      candidates.push({
        markup:
          "Exposed **GraphQL** resolvers alongside existing API routes to fetch nested payloads cleanly.",
        explanation: `Targets **GraphQL** from the JD in a realistic 1-line addition for ${target.companyOrProjectName}.`,
        keywords: ["GraphQL"],
      });
    } else if (kLower === "docker") {
      if (isSystemsTarget) {
        candidates.push({
          markup:
            "Containerized **C++** simulation test suites in **Docker** for repeatable environment builds.",
          explanation: `Aligns **Docker** from the JD cleanly with your **C++** systems workflow.`,
          keywords: ["Docker", "C++"],
        });
      } else if (hasMlSignals && !hasFrontendSignals) {
        candidates.push({
          markup:
            "Packaged **Python** evaluation runs in **Docker** containers for reproducible benchmark checks.",
          explanation: `Aligns **Docker** from the JD cleanly with your **Python** ML pipeline.`,
          keywords: ["Docker", "Python"],
        });
      } else {
        candidates.push({
          markup:
            "Containerized local backend services in **Docker** to standardize API test and dev setups.",
          explanation: `Targets **Docker** from the JD for reproducible service workflows at ${target.companyOrProjectName}.`,
          keywords: ["Docker"],
        });
      }
    } else if (kLower === "aws") {
      candidates.push({
        markup:
          "Configured **AWS** storage and deployment scripts to automate asset delivery across builds.",
        explanation: `Directly incorporates **AWS** cloud workflows requested by this job description.`,
        keywords: ["AWS"],
      });
    } else if (kLower === "webhooks") {
      candidates.push({
        markup:
          "Handled incoming **Webhooks** events with signature verification to sync workflow status.",
        explanation: `Targets **Webhooks** integration required in the JD using your existing API experience.`,
        keywords: ["Webhooks"],
      });
    } else if (/tailwind/i.test(kLower)) {
      candidates.push({
        markup:
          "Styled responsive dashboard panels in **Tailwind CSS** and **TypeScript** for faster iteration.",
        explanation: `Matches **Tailwind CSS** frontend styling requirements in the job description.`,
        keywords: ["Tailwind CSS", "TypeScript"],
      });
    } else if (kLower === "ci/cd") {
      candidates.push({
        markup:
          "Configured automated **CI/CD** integration test checks on pull requests prior to merge.",
        explanation: `Matches **CI/CD** engineering workflow emphasis in the job description.`,
        keywords: ["CI/CD"],
      });
    } else if (/^(?:jira|linear|agile)$/i.test(kLower)) {
      candidates.push({
        markup: `Coordinated bug triage and incremental API fixes across bi-weekly **${kw}** team sprints.`,
        explanation: `Connects everyday **${kw}** delivery collaboration directly to your role.`,
        keywords: [kw],
      });
    } else if (kLower === "end-to-end") {
      candidates.push({
        markup:
          "Owned **end-to-end** automated integration tests and error monitoring across API endpoints.",
        explanation: `Highlights **end-to-end** ownership sought by the job description.`,
        keywords: ["end-to-end"],
      });
    } else {
      // Custom or catalog tier_1 term
      if (hasFrontendSignals && !isFastApi) {
        candidates.push({
          markup: `Integrated **${kw}** handlers with existing **TypeScript** views and automated API tests.`,
          explanation: `Directly incorporates JD target **${kw}** alongside your existing **TypeScript** stack.`,
          keywords: [kw],
        });
      } else if (hasMlSignals && !hasFrontendSignals) {
        candidates.push({
          markup: `Integrated **${kw}** checks into **Python** evaluation scripts for reproducible model runs.`,
          explanation: `Directly incorporates JD target **${kw}** alongside your **Python** workflow.`,
          keywords: [kw],
        });
      } else {
        candidates.push({
          markup: `Integrated **${kw}** request handlers and automated validation tests across backend routes.`,
          explanation: `Directly incorporates JD target **${kw}** into a defensible 1-line engineering task.`,
          keywords: [kw],
        });
      }
    }
  }

  // Backup JD-matched options if fewer than 2 framing candidates fit
  if (candidates.length < 2) {
    const matchedWeb =
      hasFrontendSignals || tiers.matched.some((k) => /^(?:TypeScript|React|Next\.js)$/i.test(k));
    const wantsTesting =
      /\b(?:test|testing|pytest|jest|reliability|quality|observability|monitoring|latency|scale)\b/i.test(
        jdLower
      );
    const wantsPerf = /\b(?:cache|caching|performance|latency|throughput|database|sql|api)\b/i.test(
      jdLower
    );

    if (isFastApi) {
      candidates.push({
        markup:
          "Authored automated **FastAPI** integration tests and schema guards to catch regressions.",
        explanation: `Reinforces **FastAPI** API quality matching this JD's backend expectations.`,
        keywords: ["FastAPI"],
      });
    } else if (isFlask || /\bpython\b/i.test(signalsLower)) {
      if (hasMlSignals && !hasFrontendSignals) {
        candidates.push({
          markup:
            "Authored reproducible **Python** validation scripts to audit prediction consistency per build.",
          explanation: `Tailored to **Python** data/ML validation workflows in the job description.`,
          keywords: ["Python"],
        });
      } else {
        candidates.push({
          markup:
            "Added automated **Python** API integration tests and request timeout alerts on backend routes.",
          explanation: `Reinforces **Python** backend reliability and testing highlighted by this JD.`,
          keywords: ["Python"],
        });
      }
    } else if (matchedWeb) {
      if (wantsPerf || !wantsTesting) {
        candidates.push({
          markup:
            "Built typed **TypeScript** API validation schemas and error guards across interactive UI flows.",
          explanation: `Tailored to **TypeScript** full-stack quality signals in this job description.`,
          keywords: ["TypeScript"],
        });
      }
      candidates.push({
        markup:
          "Authored automated **TypeScript** endpoint tests and structured logging for client requests.",
        explanation: `Highlights **TypeScript** test coverage and observability aligned with this JD.`,
        keywords: ["TypeScript"],
      });
    } else if (isSystemsTarget) {
      candidates.push({
        markup:
          "Added automated **C++** regression tests to verify state transitions under simulation load.",
        explanation: `Tailored directly to **C++** systems reliability requested in this JD.`,
        keywords: ["C++"],
      });
    } else if (pmTool) {
      candidates.push({
        markup: `Coordinated incremental service fixes and PR reviews across team **${pmTool}** milestones.`,
        explanation: `Reinforces **${pmTool}** engineering collaboration aligned with this role.`,
        keywords: [pmTool],
      });
    }
  }

  return candidates;
}

function scoreContainersAgainstJd(
  resume: MasterResume,
  tiers: LarpTierClassification,
  jobDescription = "",
  keywordWeights?: Map<string, number>
): (ContainerCandidate & { jdRelevance: number; matchedDomains: number })[] {
  const baseContainers = selectEligibleContainersForMalleableLines(resume);
  const jdText = `${jobDescription} ${tiers.matched.join(" ")} ${tiers.tier_1_framing.join(
    " "
  )} ${tiers.tier_0_workflow.join(" ")}`;
  const jdDomains: Context[] = inferDomainTags(jdText).filter(
    (d): d is Context => d !== "general"
  );
  const jdTargetTerms = [...tiers.tier_1_framing, ...tiers.matched, ...tiers.tier_0_workflow];

  const ranked = baseContainers.map((c, idx) => {
    const combinedContainer = `${c.companyOrProjectName} ${c.roleOrProjectType} ${c.techSignals.join(
      " "
    )} ${c.existingBullets.join(" ")}`;
    const overlapDomains = c.tags.filter((t) => jdDomains.includes(t));
    let jdRelevance = 0;

    // 1. Strong bonus for domain overlap with actual JD
    jdRelevance += overlapDomains.length * 28;

    // 2. Direct keyword and pairsWith overlap with container stack
    for (const kw of jdTargetTerms) {
      const w = keywordWeights?.get(kw.toLowerCase()) ?? 1;
      if (containsPhrase(combinedContainer, kw)) {
        jdRelevance += 12 * w;
      } else {
        const entry = findCatalogEntry(kw);
        if (entry?.pairsWith?.some((pw) => containsPhrase(combinedContainer, pw))) {
          jdRelevance += 10 * w;
        }
      }
    }

    // 3. Strong penalty for systems/robotics roles on non-systems web/ML JDs
    const jdWantsSystems = jdDomains.includes("systems");
    if (c.tags.includes("systems") && !jdWantsSystems) {
      jdRelevance -= 50;
    }

    // 4. Prefer actual experience roles over hobby projects + recency boost
    if (c.kind === "experience") {
      jdRelevance += 16 + Math.max(0, 6 - idx * 2);
    }

    return {
      ...c,
      jdRelevance: Number(jdRelevance.toFixed(1)),
      matchedDomains: overlapDomains.length,
    };
  });

  ranked.sort((a, b) => b.jdRelevance - a.jdRelevance);
  return ranked;
}

/**
 * Generates context-aware 1-line malleable bullets tailored across candidate roles.
 * When `options.focusedRecommendations` is true, returns strictly 1 or 2 JD-matching
 * experience cards with up to 2 tailored JD options plus that company's saved Default Pick.
 */
export function synthesizeMalleableOneLineBullets(
  resume: MasterResume,
  tiers: LarpTierClassification,
  malleableCount?: number,
  variantOffset = 0,
  options?: SynthesizeMalleableOptions
): MalleableSynthesizedBullet[] {
  if (malleableCount !== undefined && malleableCount <= 0) {
    return [];
  }

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMax = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const minOneLineChars = Math.ceil(oneLineMax * 0.82);

  if (options?.focusedRecommendations) {
    const ranked = scoreContainersAgainstJd(
      resume,
      tiers,
      options.jobDescription,
      options.keywordWeights
    );
    if (ranked.length === 0) return [];

    // Select strictly top 1 or 2 genuinely JD-fitting containers
    const positiveMatches = ranked.filter((c) => c.jdRelevance > 10);
    const pool = positiveMatches.length > 0 ? positiveMatches : ranked.slice(0, 1);
    const chosenContainers: typeof ranked = [pool[0]];
    if (
      pool.length > 1 &&
      pool[1].kind === "experience" &&
      (pool[1].matchedDomains > 0 || pool[1].jdRelevance >= pool[0].jdRelevance - 25)
    ) {
      chosenContainers.push(pool[1]);
    }

    const framingOrWorkflowLower = new Set(
      [...tiers.tier_0_workflow, ...tiers.tier_1_framing].map((k) => k.toLowerCase())
    );
    const pureSkillsOnlyLower = tiers.tier_1_5_skills_only
      .filter((s) => !framingOrWorkflowLower.has(s.toLowerCase()))
      .map((s) => s.toLowerCase());
    const bannedLower = tiers.tier_2_banned.map((b) => b.toLowerCase());

    const results: MalleableSynthesizedBullet[] = [];

    chosenContainers.forEach((target, containerIdx) => {
      const combinedExisting = target.existingBullets.join(" ");
      const rawCandidates = buildFocusedJdCandidatesForTarget(
        target,
        tiers,
        options.keywordWeights,
        options.jobDescription || ""
      );

      // Deduplicate, fit within 1L, and reject anything leaking banned or pure Tier-1.5 skills
      const jdMatchOptions: MalleableBulletOption[] = [];
      const seenTexts = new Set<string>();
      const usedKeywords = new Set<string>();

      for (let i = 0; i < rawCandidates.length; i++) {
        const spec = rawCandidates[(variantOffset + i) % rawCandidates.length];
        const fitted = fitBulletToCalibratedLineArea(spec.markup, cal);
        const plain = plainText(fitted).trim();
        const plainLower = plain.toLowerCase();

        if (!plain || plain.length > oneLineMax) continue;
        if (seenTexts.has(plainLower)) continue;
        if (bannedLower.some((b) => containsPhrase(plain, b))) continue;
        if (pureSkillsOnlyLower.some((s) => containsPhrase(plain, s))) continue;
        if (target.existingBullets.some((eb) => jaccardSimilarity(eb, plain) >= 0.55)) {
          continue;
        }

        seenTexts.add(plainLower);
        const presentKeywords = spec.keywords.filter((kw) => containsPhrase(plain, kw));
        for (const kw of presentKeywords) usedKeywords.add(kw);

        const latex = `\\item ${markupToLatex(fitted)}`;
        jdMatchOptions.push({
          id: `malleable-${containerIdx + 1}-opt-${jdMatchOptions.length + 1}`,
          styleLabel: "JD Match",
          markup: fitted,
          latex,
          chars: plain.length,
          maxChars: oneLineMax,
          widthNcu: computeVisualWidth(latex),
          fit: bulletFit(fitted, cal),
          easyExplanation: spec.explanation,
          isNewClaim: true,
          source: "template",
        });

        if (jdMatchOptions.length >= 2) break;
      }

      // Attach Default Pick for experience roles (and if no JD Match option survived, still offer default)
      const builtOptions: MalleableBulletOption[] = [...jdMatchOptions];
      if (target.kind === "experience" || builtOptions.length === 0) {
        const companyKey = normalizeKey(target.companyOrProjectName);
        const matchingJob = resume.experience.find((j) => j.id === target.id);
        const savedDefaultRaw =
          options.defaultPicksByCompanyKey?.[companyKey] ||
          options.defaultPicksByCompanyKey?.[target.id] ||
          matchingJob?.defaultMalleableBullet?.trim() ||
          resume.defaultMalleableByContainer?.[companyKey]?.trim() ||
          fallbackDefaultPickForTarget(target);

        const fittedDefault = fitBulletToCalibratedLineArea(savedDefaultRaw, cal);
        const defaultPlain = plainText(fittedDefault).trim();
        const defaultLatex = `\\item ${markupToLatex(fittedDefault)}`;
        builtOptions.push({
          id: `malleable-${containerIdx + 1}-default`,
          styleLabel: "Default Pick",
          markup: fittedDefault,
          latex: defaultLatex,
          chars: defaultPlain.length,
          maxChars: oneLineMax,
          widthNcu: computeVisualWidth(defaultLatex),
          fit: bulletFit(fittedDefault, cal),
          easyExplanation: `Saved Default Pick for ${target.companyOrProjectName} (shared across all job applications).`,
          isNewClaim: true,
          isDefaultPick: true,
          source: "default",
        });
      }

      const primaryOpt = builtOptions[0];
      const injectedKeywords =
        Array.from(usedKeywords).length > 0
          ? Array.from(usedKeywords).slice(0, 3)
          : target.techSignals.slice(0, 2);

      const believability = calculateDynamicBelievabilityScore({
        proposedKeywords: injectedKeywords,
        containerKind: target.kind,
        containerTitle: target.title,
        domain: target.domain,
        existingTechSignals: target.techSignals,
        existingBulletsText: combinedExisting,
        actionStyle: primaryOpt.styleLabel,
        lineBudgetFit: primaryOpt.fit,
        isOlderRole: containerIdx > 0 && target.kind === "experience",
      });

      results.push({
        id: `malleable-${containerIdx + 1}`,
        targetContainerId: target.id,
        targetContainerTitle: target.title,
        targetContainerKind: target.kind,
        targetTechContext: target.techSignals,
        tags: target.tags,
        markup: primaryOpt.markup,
        latex: primaryOpt.latex,
        chars: primaryOpt.chars,
        maxChars: oneLineMax,
        widthNcu: primaryOpt.widthNcu,
        fit: primaryOpt.fit,
        injectedKeywords,
        roleContextSummary: target.roleSummary,
        believabilityScore: believability.score,
        believabilityCritique: believability.critique,
        scoreFeatures: believability.features,
        recommended: containerIdx === 0,
        options: builtOptions,
      });
    });

    return results;
  }

  const allContainers = selectEligibleContainersForMalleableLines(resume);
  if (allContainers.length === 0) return [];

  const tier1 = tiers.tier_1_framing;
  const tier0 = tiers.tier_0_workflow;
  const tier15 = tiers.tier_1_5_skills_only;

  const hasRedis =
    tier1.some((k) => k.toLowerCase() === "redis") ||
    tier15.some((k) => k.toLowerCase() === "redis");
  const hasGraphQL =
    tier1.some((k) => k.toLowerCase() === "graphql") ||
    tier15.some((k) => k.toLowerCase() === "graphql");
  const hasDocker =
    tier1.some((k) => k.toLowerCase() === "docker") ||
    tier15.some((k) => k.toLowerCase() === "docker");
  const hasWebhooks = tier1.some((k) => k.toLowerCase() === "webhooks");
  const pmTool = tier0.find((k) => /^(?:Jira|Linear|Agile)$/i.test(k)) || "Agile";

  const results: MalleableSynthesizedBullet[] = [];
  const maxSlots =
    malleableCount && malleableCount > 1 ? Math.min(allContainers.length, malleableCount) : 5;
  const targetContainers = allContainers.slice(0, maxSlots);

  targetContainers.forEach((target, containerIdx) => {
    interface OptionSpec {
      styleLabel: MalleableBulletOption["styleLabel"];
      variants: string[];
      easyExplanation: string;
      keywords: string[];
    }

    const optionSpecs: OptionSpec[] = [];
    const combinedExisting = target.existingBullets.join(" ");
    const signalsLower = `${target.techSignals.join(" ")} ${combinedExisting}`.toLowerCase();

    if (target.tags.includes("systems")) {
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Implemented automated simulation regression tests in **C++** to validate path planning stability.`,
          `Structured automated simulation test runs in **C++** to verify obstacle avoidance routines under load.`,
          hasDocker
            ? `Configured **Docker** simulation containers and automated build checks for software releases.`
            : `Wrote unit tests for **ROS 2** node transformations to ensure reliable sensor scan mapping.`,
        ],
        easyExplanation:
          "Simulation testing and automated build checks—standard, defensible systems software engineering.",
        keywords: hasDocker ? ["Docker", "C++"] : ["C++", "Testing"],
      });
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Implemented modular **C++** state-machine interfaces for real-time control and telemetry routines.`,
          `Structured message publishers and subscriber callbacks in **C++** to pipe sensor data across nodes.`,
        ],
        easyExplanation: "Clean state-machine or message piping in C++.",
        keywords: ["C++"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Tracked systems bug tickets and coordinated simulation test milestones across team **${pmTool}** sprints.`,
          `Participated in design reviews and managed software integration tasks across **${pmTool}** sprints.`,
        ],
        easyExplanation: "Subteam ticket management and sprint coordination.",
        keywords: [pmTool],
      });
    } else if (target.tags.includes("ml") && !target.tags.includes("frontend")) {
      const isComputeCluster = /\b(?:surrogate|cluster|optuna|cross-validation|parameter)\b/i.test(
        signalsLower
      );
      if (isComputeCluster) {
        optionSpecs.push({
          styleLabel: "Casual & Direct",
          variants: [
            `Developed lightweight **FastAPI** endpoints to query model predictions in sub-millisecond response time.`,
            `Automated dataset extraction and feature normalization pipelines across batch compute jobs.`,
            hasDocker
              ? `Containerized model training workflows in **Docker** to ensure reproducible evaluation runs.`
              : `Built modular **Python** data loaders to stream simulation inputs into training pipelines.`,
          ],
          easyExplanation:
            "Serving model predictions through a lightweight API or structuring batch inputs.",
          keywords: hasDocker ? ["Docker", "Python"] : ["FastAPI", "Python"],
        });
        optionSpecs.push({
          styleLabel: "Testing & Quality",
          variants: [
            `Automated cross-validation test suites in **Python** to verify model stability across parameter sweeps.`,
            `Generated model interpretability charts and validation reports to audit predictions across runs.`,
          ],
          easyExplanation:
            "Rigorous validation that demonstrates strong technical discipline.",
          keywords: ["Python", "Evaluation"],
        });
        optionSpecs.push({
          styleLabel: "Workflow & Ops",
          variants: [
            `Documented modeling milestones and coordinated deliverables across bi-weekly **${pmTool}** reviews.`,
            `Managed batch training queues and tracked evaluation benchmarks across **${pmTool}** milestones.`,
          ],
          easyExplanation: "Milestone tracking and research workflow coordination.",
          keywords: [pmTool],
        });
      } else {
        optionSpecs.push({
          styleLabel: "Casual & Direct",
          variants: [
            `Integrated automated **Python** validation scripts to verify model outputs across evaluation batches.`,
            `Built modular **PyTorch** evaluation scripts to measure detection precision across benchmark runs.`,
            `Configured **Docker** containers to standardize model evaluation and inference benchmarking.`,
          ],
          easyExplanation:
            "Grounded directly in everyday ML scripting and model output verification.",
          keywords: hasDocker ? ["Docker", "Python"] : ["Python", "PyTorch"],
        });
        optionSpecs.push({
          styleLabel: "Testing & Quality",
          variants: [
            `Authored automated **Python** test suites to evaluate held-out precision and regression across builds.`,
            `Implemented automated data audit checks in **Python** to validate output quality prior to export.`,
            `Structured reproducible evaluation benchmarks to catch prediction drift across inference runs.`,
          ],
          easyExplanation:
            "Standard quality engineering and metric reporting that sounds authoritative in an interview.",
          keywords: ["Python", "Evaluation"],
        });
        optionSpecs.push({
          styleLabel: "Workflow & Ops",
          variants: [
            `Collaborated in **${pmTool}** sprints to triage pipeline anomalies and deliver weekly feature updates.`,
            `Coordinated feature milestones and release checklists across bi-weekly **${pmTool}** sprint cycles.`,
          ],
          easyExplanation:
            "Everyday team agile coordination and task triage with zero technical overclaim.",
          keywords: [pmTool],
        });
      }
    } else if (target.tags.includes("backend") && /\bfastapi\b/i.test(signalsLower)) {
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Maintained **FastAPI** streaming endpoints and structured error handlers for real-time service turns.`,
          `Built lightweight **Python** service utilities to format and inject request context into backend handlers.`,
          hasRedis
            ? `Stored active session keys in **Redis** and streamed live status updates to the client interface.`
            : `Implemented structured message handlers in **FastAPI** to stream low-latency service responses.`,
        ],
        easyExplanation: "Straightforward backend API routing in Python and FastAPI.",
        keywords: hasRedis ? ["Redis", "FastAPI"] : ["FastAPI", "Python"],
      });
      optionSpecs.push({
        styleLabel: "Simple Integration",
        variants: [
          hasWebhooks
            ? `Handled incoming client **Webhooks** and event triggers to update service workflows in real time.`
            : `Connected client **REST APIs** with automated backend triggers to streamline request intake.`,
          hasDocker
            ? `Containerized **FastAPI** backend services in **Docker** to ensure reproducible environment builds.`
            : `Structured modular **REST API** client adapters to pipe parsed request data into service handlers.`,
        ],
        easyExplanation:
          "Frames external services as basic webhooks or REST API calls—easy to defend.",
        keywords: hasWebhooks ? ["Webhooks"] : hasDocker ? ["Docker"] : ["REST APIs"],
      });
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Authored automated API integration tests to measure and maintain low-latency endpoint responses.`,
          `Added structured request logging and timeout alerts to monitor backend service stability under load.`,
        ],
        easyExplanation:
          "Latency benchmarking and integration tests—very impressive to hiring managers.",
        keywords: ["Testing", "REST APIs"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Tracked service deployment tickets and client integration bugs across bi-weekly **${pmTool}** sprint reviews.`,
          `Coordinated release verification and onboarding checklists in **${pmTool}** sprint standups.`,
        ],
        easyExplanation: "Agile ticket tracking and feature delivery.",
        keywords: [pmTool],
      });
    } else {
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Built modular backend API endpoints and request validators in **TypeScript** to format core application data.`,
          hasRedis
            ? `Cached repeat query lookups in **Redis** and structured **REST API** responses to minimize database load.`
            : `Developed backend service routes and error handling utilities to streamline data flow across tools.`,
        ],
        easyExplanation: "Standard day-to-day backend development in your primary language.",
        keywords: hasRedis ? ["Redis", "REST APIs"] : ["TypeScript", "REST APIs"],
      });
      optionSpecs.push({
        styleLabel: "Simple Integration",
        variants: [
          hasGraphQL
            ? `Queried **GraphQL** endpoints and **REST APIs** to fetch live application data for interface views.`
            : `Connected external service APIs and webhook listeners to automate background synchronization jobs.`,
          hasDocker
            ? `Configured **Docker** containers and environment configurations to standardize local development setups.`
            : `Integrated third-party APIs and formatted JSON payloads for downstream client consumption.`,
        ],
        easyExplanation: "Consuming external endpoints or standard Docker containerization.",
        keywords: hasGraphQL ? ["GraphQL"] : hasDocker ? ["Docker"] : ["REST APIs"],
      });
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Authored automated unit and integration tests to verify endpoint stability and prevent regressions on release.`,
          `Added structured request logging and error alerts to simplify debugging across internal service APIs.`,
        ],
        easyExplanation: "Simple testing and logging that every engineering team loves.",
        keywords: ["Testing", "APIs"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Collaborated in **${pmTool}** sprints to deliver feature updates and resolve critical issue tickets on schedule.`,
          `Managed issue triage, coordinated pull request reviews, and tracked release checklists in **${pmTool}**.`,
        ],
        easyExplanation:
          "Everyday agile sprint participation and pull request collaboration.",
        keywords: [pmTool],
      });
    }

    const builtOptions: MalleableBulletOption[] = optionSpecs.map((spec, optIdx) => {
      const preferredVariantIdx = variantOffset % spec.variants.length;
      let chosen = fitBulletToCalibratedLineArea(spec.variants[preferredVariantIdx], cal);
      for (let vIdx = 0; vIdx < spec.variants.length; vIdx++) {
        const v = spec.variants[(preferredVariantIdx + vIdx) % spec.variants.length];
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
        id: `malleable-${containerIdx + 1}-opt-${optIdx + 1}`,
        styleLabel: spec.styleLabel,
        markup: chosen,
        latex,
        chars: finalLen,
        maxChars: oneLineMax,
        widthNcu: computeVisualWidth(latex),
        fit: bulletFit(chosen, cal),
        easyExplanation: spec.easyExplanation,
        isNewClaim: true,
        source: "template",
      };
    });

    const primaryOpt = builtOptions[0];
    const primaryKeywords = optionSpecs[0]?.keywords || ["Tools"];

    const believability = calculateDynamicBelievabilityScore({
      proposedKeywords: primaryKeywords,
      containerKind: target.kind,
      containerTitle: target.title,
      domain: target.domain,
      existingTechSignals: target.techSignals,
      existingBulletsText: combinedExisting,
      actionStyle: primaryOpt.styleLabel,
      lineBudgetFit: primaryOpt.fit,
      isOlderRole: containerIdx > 0 && target.kind === "experience",
    });

    results.push({
      id: `malleable-${containerIdx + 1}`,
      targetContainerId: target.id,
      targetContainerTitle: target.title,
      targetContainerKind: target.kind,
      targetTechContext: target.techSignals,
      tags: target.tags,
      markup: primaryOpt.markup,
      latex: primaryOpt.latex,
      chars: primaryOpt.chars,
      maxChars: oneLineMax,
      widthNcu: primaryOpt.widthNcu,
      fit: primaryOpt.fit,
      injectedKeywords: primaryKeywords,
      roleContextSummary: target.roleSummary,
      believabilityScore: believability.score,
      believabilityCritique: believability.critique,
      scoreFeatures: believability.features,
      recommended: containerIdx === 0,
      options: builtOptions,
    });
  });

  return results;
}
