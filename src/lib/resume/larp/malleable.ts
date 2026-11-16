import { markupToLatex } from "../latex";
import { bulletFit, plainText } from "../utils";
import { DEFAULT_CALIBRATION, inferDomainTags } from "./config";
import { calculateDynamicBelievabilityScore } from "./scoring";
import { computeVisualWidth, fitBulletToCalibratedLineArea } from "./text";
import type {
  ContainerCandidate,
  Context,
  LarpTierClassification,
  MalleableBulletOption,
  MalleableSynthesizedBullet,
  MasterResume,
} from "./types";

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

/**
 * Generates context-aware 1-line LARP bullets tailored across candidate roles
 * and experiences, using domain tags (`ml`, `backend`, `frontend`, `infra`, `systems`)
 * and existing tech signals rather than resume-specific hardcoded company names.
 */
export function synthesizeMalleableOneLineBullets(
  resume: MasterResume,
  tiers: LarpTierClassification,
  malleableCount?: number,
  variantOffset = 0
): MalleableSynthesizedBullet[] {
  const allContainers = selectEligibleContainersForMalleableLines(resume);
  if (allContainers.length === 0) return [];

  if (malleableCount !== undefined && malleableCount <= 0) {
    return [];
  }

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMax = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const minOneLineChars = Math.ceil(oneLineMax * 0.82);

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
      recommended: containerIdx === 0,
      options: builtOptions,
    });
  });

  return results;
}
