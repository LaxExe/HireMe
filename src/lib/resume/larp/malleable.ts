import { markupToLatex } from "../latex";
import { bulletFit, plainText } from "../utils";
import { DEFAULT_CALIBRATION, DOMAIN_HINTS } from "./config";
import { calculateDynamicBelievabilityScore } from "./scoring";
import { computeVisualWidth, fitBulletToCalibratedLineArea } from "./text";
import type {
  ContainerCandidate,
  LarpTierClassification,
  MalleableBulletOption,
  MalleableSynthesizedBullet,
  MasterResume,
} from "./types";

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
    const combined = `${job.title} ${job.company} ${bulletsText}`;

    let domain: ContainerCandidate["domain"] = "general";
    if (DOMAIN_HINTS.mlVision.test(combined)) {
      domain = "ml-vision";
    } else if (DOMAIN_HINTS.mlResearch.test(combined)) {
      domain = "ml-research";
    } else if (DOMAIN_HINTS.voiceAi.test(combined)) {
      domain = "voice-ai";
    } else if (DOMAIN_HINTS.systemsRoboticsRole.test(combined)) {
      domain = "systems-robotics";
    } else if (DOMAIN_HINTS.fullstackBackendRole.test(combined)) {
      domain = "fullstack-backend";
    }

    const techSignals = job.bullets.flatMap((b) => b.tools);
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
      domain,
      score: baseScore,
    });
  });

  for (const proj of resume.projects) {
    const bulletsText = proj.bullets.map((b) => plainText(b.text)).join(" ");
    const combined = `${proj.name} ${proj.techStack.join(" ")} ${bulletsText}`;

    let domain: ContainerCandidate["domain"] = "general";
    if (DOMAIN_HINTS.systemsRoboticsProject.test(combined)) {
      domain = "systems-robotics";
    } else if (DOMAIN_HINTS.mlVisionProject.test(combined)) {
      domain = "ml-vision";
    } else if (DOMAIN_HINTS.fullstackBackendProject.test(combined)) {
      domain = "fullstack-backend";
    }

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
      domain,
      score: baseScore,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Generates context-aware 1-line LARP bullets tailored across MULTIPLE candidate roles
 * and experiences, providing distinct phrasing styles and genuine, dynamic believability scores.
 */
export function synthesizeMalleableOneLineBullets(
  resume: MasterResume,
  tiers: LarpTierClassification,
  malleableCount: number,
  variantOffset = 0
): MalleableSynthesizedBullet[] {
  void malleableCount;
  const allContainers = selectEligibleContainersForMalleableLines(resume);
  if (allContainers.length === 0) return [];

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMax = cal.oneLineMax || 108;
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
  const targetContainers = allContainers.slice(0, 5);

  targetContainers.forEach((target, containerIdx) => {
    interface OptionSpec {
      styleLabel: MalleableBulletOption["styleLabel"];
      variants: string[];
      easyExplanation: string;
      keywords: string[];
    }

    const optionSpecs: OptionSpec[] = [];
    const combinedExisting = target.existingBullets.join(" ");

    if (target.domain === "ml-vision") {
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Integrated automated **Python** validation scripts to verify bounding-box coordinates across auto-label batches.`,
          `Built modular **PyTorch** and **OpenCV** evaluation scripts to measure detection precision across demo runs.`,
          `Configured **Docker** containers to standardize VLM detector evaluation and inference benchmarking.`,
        ],
        easyExplanation:
          "Grounded directly in everyday computer vision scripting and model output verification.",
        keywords: hasDocker ? ["Docker", "Python"] : ["Python", "PyTorch"],
      });
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Authored automated **TorchMetrics** test suites to evaluate held-out mAP and IoU regression across model builds.`,
          `Implemented automated image audit checks in **Python** to validate IoU precision prior to dataset export.`,
          `Structured reproducible evaluation benchmarks to catch bounding-box drift across zero-shot runs.`,
        ],
        easyExplanation:
          "Standard quality engineering and metric reporting that sounds completely authoritative in an interview.",
        keywords: ["TorchMetrics", "Evaluation"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Collaborated in **${pmTool}** sprints to triage bounding-box anomalies and deliver weekly auto-labeling updates.`,
          `Coordinated feature milestones and demo release checklists across bi-weekly **${pmTool}** sprint cycles.`,
        ],
        easyExplanation:
          "Everyday team agile coordination and task triage with zero technical overclaim.",
        keywords: [pmTool],
      });
    } else if (target.domain === "voice-ai") {
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Maintained **FastAPI** streaming endpoints and structured error handlers for real-time voice agent turns.`,
          `Built lightweight **Python** service utilities to format and inject client scraping context into voice agents.`,
          hasRedis
            ? `Stored active call session keys in **Redis** and streamed live status updates to the dispatch interface.`
            : `Implemented structured WebSocket message handlers in **FastAPI** to stream agent response audio.`,
        ],
        easyExplanation: "Straightforward WebSocket and backend API routing in Python.",
        keywords: hasRedis ? ["Redis", "FastAPI"] : ["FastAPI", "WebSockets"],
      });
      optionSpecs.push({
        styleLabel: "Simple Integration",
        variants: [
          hasWebhooks
            ? `Handled incoming client **Webhooks** and event triggers to update agent dispatch workflows in real time.`
            : `Connected client **REST APIs** with automated voice agent triggers to streamline customer intake.`,
          hasDocker
            ? `Containerized **FastAPI** scraper services in **Docker** to ensure reproducible client environment builds.`
            : `Structured modular **REST API** client adapters to pipe parsed website data into agent context.`,
        ],
        easyExplanation:
          "Frames external services as basic webhooks or REST API calls—easy to defend.",
        keywords: hasWebhooks ? ["Webhooks"] : hasDocker ? ["Docker"] : ["REST APIs"],
      });
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Authored automated WebSocket integration tests to measure and maintain sub-2s voice response latency.`,
          `Added structured request logging and timeout alerts to monitor voice agent turn stability under load.`,
        ],
        easyExplanation:
          "Latency benchmarking and integration tests—very impressive to hiring managers.",
        keywords: ["Testing", "WebSockets"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Tracked agent deployment tickets and client integration bugs across bi-weekly **${pmTool}** sprint reviews.`,
          `Coordinated release verification and client onboarding checklists in **${pmTool}** sprint standups.`,
        ],
        easyExplanation: "Agile ticket tracking and feature delivery.",
        keywords: [pmTool],
      });
    } else if (target.domain === "ml-research") {
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Developed lightweight **FastAPI** endpoints to query surrogate model predictions in sub-millisecond response time.`,
          `Automated surrogate dataset extraction and feature normalization pipelines across Slurm compute arrays.`,
          hasDocker
            ? `Containerized surrogate modeling workflows in **Docker** to ensure reproducible cluster runs.`
            : `Built modular **Python** data loaders to stream pore-network simulation inputs into training arrays.`,
        ],
        easyExplanation:
          "Serving surrogate predictions through a lightweight API or structuring batch inputs.",
        keywords: hasDocker ? ["Docker", "Python"] : ["FastAPI", "Python"],
      });
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Automated 10-fold cross-validation suites in **Python** to verify surrogate model stability across parameter sweeps.`,
          `Generated SHAP interpretability charts and validation reports to audit model predictions across conditions.`,
        ],
        easyExplanation:
          "Rigorous scientific validation that demonstrates strong technical discipline.",
        keywords: ["Python", "Evaluation"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Documented surrogate model milestones and coordinated research deliverables across bi-weekly team reviews.`,
          `Managed simulation job queues and tracked computational benchmarks for co-authored preprint milestones.`,
        ],
        easyExplanation: "Research milestone tracking and publication workflow coordination.",
        keywords: [pmTool],
      });
    } else if (target.domain === "systems-robotics") {
      optionSpecs.push({
        styleLabel: "Testing & Quality",
        variants: [
          `Implemented automated collision regression tests in **Gazebo** to validate Theta* path planning stability.`,
          `Structured automated simulation test runs in **C++** to verify obstacle avoidance routines under route changes.`,
          hasDocker
            ? `Configured **Docker** simulation containers and automated build checks for autonomy software releases.`
            : `Wrote unit tests for ROS 2 occupancy-grid node transformations to ensure reliable LiDAR scan mapping.`,
        ],
        easyExplanation:
          "Simulation testing in Gazebo/Docker—standard, defensible robotics software engineering.",
        keywords: hasDocker ? ["Docker", "C++"] : ["Gazebo", "C++"],
      });
      optionSpecs.push({
        styleLabel: "Casual & Direct",
        variants: [
          `Implemented modular **C++** state-machine interfaces for gripper pick-and-place routines on Pioneer robot.`,
          `Structured ROS 2 message publishers and subscriber callbacks to pipe simulated LiDAR data to grid nodes.`,
        ],
        easyExplanation: "Clean state-machine or message piping in C++.",
        keywords: ["C++", "ROS 2"],
      });
      optionSpecs.push({
        styleLabel: "Workflow & Ops",
        variants: [
          `Tracked autonomy stack bug tickets and coordinated Gazebo simulation milestones across team **${pmTool}** sprints.`,
          `Participated in design reviews and managed software integration tasks across robotics team sprints.`,
        ],
        easyExplanation: "Autonomy subteam ticket management and sprint coordination.",
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
