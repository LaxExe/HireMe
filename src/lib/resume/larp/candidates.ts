import { plainText } from "../utils";
import { DOMAIN_HINTS } from "./config";
import { containsPhrase } from "./text";
import type { BulletDomainContext } from "./types";

export interface MinimalInjectionAttempt {
  mutatedMarkup: string;
  reason: string;
  fitScore: number;
}

export function classifyBulletContext(
  bulletMarkup: string,
  containerTitle: string
): BulletDomainContext {
  const combined = `${containerTitle} ${plainText(bulletMarkup)}`;

  if (DOMAIN_HINTS.systemsCppRobotics.test(combined)) {
    return "systems-cpp-robotics";
  }

  if (DOMAIN_HINTS.frontendUi.test(combined)) {
    return "frontend-ui";
  }

  if (DOMAIN_HINTS.cloudDeployInfra.test(combined)) {
    return "cloud-deploy-infra";
  }

  return "backend-api-db";
}

function injectAws(trimmed: string, context: BulletDomainContext): MinimalInjectionAttempt | null {
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
    if (
      /\b(?:APIs?|services?|pipeline|backend|server|PostgreSQL|FastAPI|Flask|Node\.js)\b/i.test(
        trimmed
      ) &&
      /\.$/.test(trimmed)
    ) {
      return {
        mutatedMarkup: trimmed.replace(/\.$/, " on **AWS**."),
        reason: "Appended lightweight AWS hosting context to backend bullet",
        fitScore: 84,
      };
    }
  }
  return null;
}

function injectRedis(trimmed: string, context: BulletDomainContext): MinimalInjectionAttempt | null {
  if (
    /\bDeveloped \*\*REST APIs\*\* and relational \*\*PostgreSQL\*\* schemas to standardize eligibility records across (\*\*\d+\*\*|\d+) internal services\.$/i.test(
      trimmed
    )
  ) {
    return {
      mutatedMarkup: trimmed.replace(
        /\bDeveloped \*\*REST APIs\*\* and relational \*\*PostgreSQL\*\* schemas to standardize eligibility records across (\*\*\d+\*\*|\d+) internal services\.$/i,
        "Built **REST APIs**, **Redis** cache, and **PostgreSQL** schemas standardizing records across $1 services."
      ),
      reason: "Added Redis caching and tightened bullet to fit cleanly inside 1-line area",
      fitScore: 99,
    };
  }
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
  return null;
}

function injectGraphQL(trimmed: string): MinimalInjectionAttempt | null {
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
        "Built **REST/GraphQL APIs** and"
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
  return null;
}

function injectTailwindCss(
  trimmed: string,
  context: BulletDomainContext
): MinimalInjectionAttempt | null {
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
  return null;
}

function injectWebhooks(trimmed: string): MinimalInjectionAttempt | null {
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
  return null;
}

function injectDocker(
  trimmed: string,
  context: BulletDomainContext
): MinimalInjectionAttempt | null {
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
  return null;
}

function injectJiraOrLinear(
  trimmed: string,
  context: BulletDomainContext,
  keyword: string
): MinimalInjectionAttempt | null {
  if (/\bGave clients control over call workflows and dispatch timing\b/i.test(trimmed)) {
    return {
      mutatedMarkup: trimmed.replace(
        /\bGave clients control over call workflows and dispatch timing\b/i,
        `Gave clients control over **${keyword}**-tracked call workflows and dispatch timing`
      ),
      reason: `Centralized ${keyword} workflow mention on client dispatch & dashboard bullet`,
      fitScore: 95,
    };
  }
  if (/\bacross (\*\*\d+\*\*|\d+) internal services\.$/i.test(trimmed)) {
    return {
      mutatedMarkup: trimmed.replace(
        /\bacross (\*\*\d+\*\*|\d+) internal services\.$/i,
        `across $1 internal services tracked in **${keyword}**.`
      ),
      reason: `Centralized ${keyword} sprint tracking on internal services bullet`,
      fitScore: 91,
    };
  }
  if (
    (context === "frontend-ui" || context === "backend-api-db") &&
    /\b(?:workflows?|features?|dashboards?|services?|sprints?)\b/i.test(trimmed) &&
    /\.$/.test(trimmed)
  ) {
    return {
      mutatedMarkup: trimmed.replace(/\.$/, `, tracked in **${keyword}**.`),
      reason: `Centralized ${keyword} mention on product/feature bullet`,
      fitScore: 86,
    };
  }
  return null;
}

function injectAgile(
  trimmed: string,
  context: BulletDomainContext
): MinimalInjectionAttempt | null {
  if (
    (context === "frontend-ui" || context === "backend-api-db") &&
    /\b(?:Developed|Built|Shipped)\b/i.test(trimmed) &&
    /\.$/.test(trimmed)
  ) {
    return {
      mutatedMarkup: trimmed.replace(/\.$/, " in **Agile** sprints."),
      reason: "Centralized Agile sprint mention on feature delivery bullet",
      fitScore: 85,
    };
  }
  return null;
}

function injectEndToEnd(trimmed: string): MinimalInjectionAttempt | null {
  if (/^(?:Developed|Built)\s+(?!\*\*end-to-end\*\*)/i.test(trimmed)) {
    return {
      mutatedMarkup: trimmed.replace(/^(Developed|Built)\s+/i, "$1 **end-to-end** "),
      reason: "Centralized end-to-end ownership qualifier on a single feature bullet",
      fitScore: 88,
    };
  }
  return null;
}

export function tryMinimalKeywordInjection(
  origMarkup: string,
  context: BulletDomainContext,
  keyword: string
): MinimalInjectionAttempt | null {
  if (context === "systems-cpp-robotics") return null;
  if (containsPhrase(plainText(origMarkup), keyword)) return null;

  const trimmed = origMarkup.trim();

  if (keyword === "AWS") return injectAws(trimmed, context);
  if (keyword === "Redis") return injectRedis(trimmed, context);
  if (keyword === "GraphQL") return injectGraphQL(trimmed);
  if (keyword === "Tailwind CSS") return injectTailwindCss(trimmed, context);
  if (keyword === "Webhooks") return injectWebhooks(trimmed);
  if (keyword === "Docker") return injectDocker(trimmed, context);
  if (keyword === "Jira" || keyword === "Linear") {
    return injectJiraOrLinear(trimmed, context, keyword);
  }
  if (keyword === "Agile") return injectAgile(trimmed, context);
  if (keyword === "end-to-end") return injectEndToEnd(trimmed);

  return null;
}
