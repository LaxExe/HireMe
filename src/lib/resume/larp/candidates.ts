import { plainText } from "../utils";
import { findCatalogEntry, getFocusedInjectionSpecForEntry } from "./catalog";
import { inferDomainTags } from "./config";
import { containsPhrase } from "./text";
import type { BulletDomainContext, CandidateBulletSlot, Context } from "./types";

export interface MinimalInjectionAttempt {
  mutatedMarkup: string;
  reason: string;
  fitScore: number;
  source?: "rule" | "generic";
}

export interface PlausibilityCheckResult {
  ok: boolean;
  pairsWithHit: boolean;
  contextOverlap: boolean;
  reason?: "systems_context" | "implausible_slot" | "ecosystem_mismatch";
}

const JVM_LOCKED_RE = /^(?:java|spring(?:\s*boot)?|kotlin|scala|junit|maven|gradle|hibernate)$/i;
const JS_TS_LOCKED_RE =
  /^(?:jest|node(?:\.js)?|express(?:\.js)?|react(?:\s*native)?|next(?:\.js)?|tailwind(?:\s*css)?|redux|angular|vue(?:\.js)?|svelte|typescript|javascript|html5?|css3?)$/i;
const PYTHON_LOCKED_RE =
  /^(?:python|fastapi|flask|django|pytorch|tensorflow|pandas|numpy|scikit-learn|opencv|langchain|hugging\s*face|llama\.cpp|pytest|optuna)$/i;
const CPP_SYSTEMS_LOCKED_RE =
  /^(?:c\+\+|c|cmake|ros\s*2?|gazebo|cuda|verilog|assembly|rtos)$/i;
const OTHER_LANG_LOCKED_RE =
  /^(?:go|golang|rust|c#|\.net|ruby(?:\s*on\s*rails)?|rails|php|swift|dart|flutter|elixir|matlab)$/i;

const BULLET_PYTHON_SIGNAL_RE =
  /\b(?:python|fastapi|flask|django|pytorch|tensorflow|pandas|numpy|scikit-learn|opencv|slurm|sam\s*2|optuna|pytest|llama\.cpp)\b/i;
const BULLET_JS_TS_SIGNAL_RE =
  /\b(?:typescript|javascript|react|next\.js|node\.js|express|tailwind|redux|jest|html|css|frontend|ui\b|dashboard|portal)\b/i;
const BULLET_CPP_SIGNAL_RE =
  /(?:\bc\+\+|\b(?:cmake|ros\s*2|gazebo|cuda|lidar|occupancy-grid|embedded|firmware|rtos)\b)/i;
const BULLET_JVM_SIGNAL_RE = /\b(?:java|spring\s*boot|kotlin|scala|junit|maven|gradle)\b/i;
const BULLET_WEB_DB_HIGHLEVEL_RE =
  /\b(?:typescript|javascript|react|next\.js|tailwind|node\.js|fastapi|flask|postgresql|supabase|firebase|twilio|stripe|oauth|graphql|webhooks)\b/i;

/**
 * Enforces strict programming-language and ecosystem coherence between a target bullet (and its
 * role/project stack) and a candidate keyword. Prevents implausible cross-ecosystem injections
 * such as Java/Jest in a Python bullet, FastAPI/PyTorch in a TypeScript/React bullet, or CMake/C++
 * in a web dashboard bullet.
 */
export function checkEcosystemCompatibility(
  bulletMarkup: string,
  bulletTools: string[],
  containerStack: string[] | undefined,
  keywordOrId: string
): boolean {
  const entry = findCatalogEntry(keywordOrId);
  const kwLabel = (entry?.label ?? keywordOrId).trim();
  const kwLower = kwLabel.toLowerCase();

  const bulletText = `${plainText(bulletMarkup)} ${bulletTools.join(" ")}`;
  const stackText = `${bulletText} ${(containerStack ?? []).join(" ")}`;

  const bulletHasPython = BULLET_PYTHON_SIGNAL_RE.test(bulletText);
  const bulletHasJsTs = BULLET_JS_TS_SIGNAL_RE.test(bulletText);
  const bulletHasCpp = BULLET_CPP_SIGNAL_RE.test(bulletText);
  const bulletHasJvm = BULLET_JVM_SIGNAL_RE.test(bulletText);

  const stackHasPython = BULLET_PYTHON_SIGNAL_RE.test(stackText);
  const stackHasJsTs = BULLET_JS_TS_SIGNAL_RE.test(stackText);
  const stackHasCpp = BULLET_CPP_SIGNAL_RE.test(stackText);
  const stackHasJvm = BULLET_JVM_SIGNAL_RE.test(stackText);

  // 1. JVM / Java ecosystem tools require Java/JVM already present in the bullet or role stack
  if (JVM_LOCKED_RE.test(kwLower)) {
    if (!stackHasJvm) return false;
    if ((bulletHasPython || bulletHasJsTs || bulletHasCpp) && !bulletHasJvm) return false;
  }

  // 2. JS / TS / Frontend tools must never be injected into a pure Python, C++, or JVM bullet
  if (JS_TS_LOCKED_RE.test(kwLower)) {
    if ((bulletHasPython || bulletHasCpp || bulletHasJvm) && !bulletHasJsTs) {
      return false;
    }
    if (!stackHasJsTs) {
      return false;
    }
  }

  // 3. Python ecosystem tools must never be injected into a pure JS/TS, C++, or JVM bullet
  if (PYTHON_LOCKED_RE.test(kwLower)) {
    if ((bulletHasJsTs || bulletHasCpp || bulletHasJvm) && !bulletHasPython) {
      return false;
    }
    if (!stackHasPython) {
      return false;
    }
  }

  // 4. C / C++ / Systems tools must never be injected into web/DB/JS/Python-API bullets
  if (CPP_SYSTEMS_LOCKED_RE.test(kwLower)) {
    if (BULLET_WEB_DB_HIGHLEVEL_RE.test(bulletText) && !bulletHasCpp) {
      return false;
    }
    if (!stackHasCpp && !/\blinux\b/i.test(stackText)) {
      return false;
    }
  }

  // 5. Other standalone languages (Go, Rust, C#, Ruby, Swift, PHP, etc.) require existing presence in role stack
  if (OTHER_LANG_LOCKED_RE.test(kwLower)) {
    if (!containsPhrase(stackText, kwLabel)) {
      return false;
    }
  }

  return true;
}

/**
 * Hard plausibility gate evaluated BEFORE generating candidates for a `(bulletSlot, keyword)` pair.
 * - Never injects into `systems-cpp-robotics` bullets unless the keyword is systems-compatible.
 * - `ok = tier_0 OR bullet/container already uses a tech in entry.pairsWith OR entry.contexts overlaps the bullet's tags`
 */
export function checkSlotPlausibility(
  slot: Pick<CandidateBulletSlot, "bullet" | "context" | "tags" | "containerStack">,
  keywordOrId: string,
  allowExtendedFallback = false
): PlausibilityCheckResult {
  const entry = findCatalogEntry(keywordOrId);
  const spec =
    entry && allowExtendedFallback ? getFocusedInjectionSpecForEntry(entry) : entry;
  const effectiveContexts = spec?.contexts;
  const effectivePairsWith = spec?.pairsWith;

  if (
    (slot.context === "systems-cpp-robotics" || slot.tags.includes("systems")) &&
    !effectiveContexts?.includes("systems")
  ) {
    return {
      ok: false,
      pairsWithHit: false,
      contextOverlap: false,
      reason: "systems_context",
    };
  }

  if (!entry) {
    return {
      ok: false,
      pairsWithHit: false,
      contextOverlap: false,
      reason: "implausible_slot",
    };
  }

  if (
    !checkEcosystemCompatibility(
      slot.bullet.text,
      slot.bullet.tools,
      slot.containerStack,
      entry.label
    )
  ) {
    return {
      ok: false,
      pairsWithHit: false,
      contextOverlap: false,
      reason: "implausible_slot",
    };
  }

  const bulletAndStackText = `${plainText(slot.bullet.text)} ${slot.bullet.tools.join(" ")} ${(
    slot.containerStack ?? []
  ).join(" ")}`;

  const pairsWithHit = (effectivePairsWith ?? []).some((pw) =>
    containsPhrase(bulletAndStackText, pw)
  );
  const slotContextTag = bulletDomainContextToTag(slot.context);
  const contextOverlap = (effectiveContexts ?? []).some(
    (ctx) => slot.tags.includes(ctx) || ctx === slotContextTag
  );
  const isTier0 = entry.tier === "tier_0_workflow";
  const isPmTicketTool = /^(?:jira|linear|agile)$/i.test(entry.label);
  const isPureMlOrMathBullet =
    /\b(?:pytorch|sam\s*2|vlm|optuna|slurm|dataset annotation|permeability|hyperparameter|detectors?|occupancy-grid|lidar)\b/i.test(
      plainText(slot.bullet.text)
    ) && !/\b(?:sprint|release|feature|dashboard|portal|client|api|service)\b/i.test(plainText(slot.bullet.text));

  if (isPmTicketTool && isPureMlOrMathBullet) {
    return {
      ok: false,
      pairsWithHit: false,
      contextOverlap: false,
      reason: "implausible_slot",
    };
  }

  const ok = isTier0 || pairsWithHit || contextOverlap;

  return {
    ok,
    pairsWithHit,
    contextOverlap,
    reason: ok ? undefined : "implausible_slot",
  };
}

export function contextToBulletDomainContext(tags: Context[]): BulletDomainContext {
  if (tags.includes("systems")) return "systems-cpp-robotics";
  if (tags.includes("frontend")) return "frontend-ui";
  if (tags.includes("infra")) return "cloud-deploy-infra";
  return "backend-api-db";
}

export function bulletDomainContextToTag(ctx: BulletDomainContext): Context {
  if (ctx === "systems-cpp-robotics") return "systems";
  if (ctx === "frontend-ui") return "frontend";
  if (ctx === "cloud-deploy-infra") return "infra";
  return "backend";
}

export function classifyBulletContext(
  bulletMarkup: string,
  containerTitle: string,
  containerTags?: Context[]
): BulletDomainContext {
  const tags = [
    ...(containerTags ?? []),
    ...inferDomainTags(`${containerTitle} ${plainText(bulletMarkup)}`),
  ];
  return contextToBulletDomainContext(tags);
}

function expandRuleTemplate(template: string, label: string): string {
  return template
    .replace(/\{kw\}/g, `**${label}**`)
    .replace(/\{label\}/g, label);
}

/**
 * Evaluates data-driven `rules` and `suffixes` from `LARP_CATALOG` for a given bullet and keyword.
 */
export function tryMinimalKeywordInjection(
  origMarkup: string,
  context: BulletDomainContext,
  keyword: string,
  allowGenericSuffixFallback = true,
  allowExtendedFallbackRules = false
): MinimalInjectionAttempt | null {
  if (containsPhrase(plainText(origMarkup), keyword)) return null;

  const trimmed = origMarkup.trim();
  const entry = findCatalogEntry(keyword);
  if (!entry) return null;
  const spec = allowExtendedFallbackRules ? getFocusedInjectionSpecForEntry(entry) : entry;
  if (context === "systems-cpp-robotics" && !spec.contexts?.includes("systems")) {
    return null;
  }

  const contextTag = bulletDomainContextToTag(context);
  const rulesToTry = spec.rules ?? [];
  const suffixesToTry = spec.suffixes ?? [];

  if (rulesToTry.length > 0) {
    for (const rule of rulesToTry) {
      if (rule.contexts && !rule.contexts.includes(contextTag)) {
        continue;
      }
      if (rule.find.test(trimmed)) {
        const replacement = expandRuleTemplate(rule.replace, entry.label);
        const mutatedMarkup = trimmed.replace(rule.find, replacement);
        if (mutatedMarkup !== trimmed) {
          return {
            mutatedMarkup,
            reason: expandRuleTemplate(
              rule.reason ?? `Applied ${entry.label} rewrite rule`,
              entry.label
            ),
            fitScore: rule.score,
            source: "rule",
          };
        }
      }
    }
  }

  if (allowGenericSuffixFallback && suffixesToTry.length > 0 && /\.$/.test(trimmed)) {
    for (const suf of suffixesToTry) {
      if (suf.contexts && !suf.contexts.includes(contextTag)) {
        continue;
      }
      if (suf.requiresVerb && !suf.requiresVerb.test(trimmed)) {
        continue;
      }
      const expandedSuffix = expandRuleTemplate(suf.suffix, entry.label);
      const mutatedMarkup = trimmed.replace(/\.$/, `${expandedSuffix}.`);
      return {
        mutatedMarkup,
        reason: expandRuleTemplate(
          suf.reason ?? `Appended ${entry.label} suffix`,
          entry.label
        ),
        fitScore: suf.score,
        source: "generic",
      };
    }
  }

  return null;
}

/**
 * Returns all candidate rewrites (both specific rules and generic suffixes) for a bullet and keyword.
 */
export function generateAllRuleCandidatesForSlot(
  origMarkup: string,
  context: BulletDomainContext,
  keyword: string,
  includeGenericSuffixes = true,
  allowExtendedFallbackRules = false
): MinimalInjectionAttempt[] {
  if (containsPhrase(plainText(origMarkup), keyword)) return [];

  const trimmed = origMarkup.trim();
  const entry = findCatalogEntry(keyword);
  if (!entry) return [];
  const spec = allowExtendedFallbackRules ? getFocusedInjectionSpecForEntry(entry) : entry;
  if (context === "systems-cpp-robotics" && !spec.contexts?.includes("systems")) {
    return [];
  }

  const contextTag = bulletDomainContextToTag(context);
  const results: MinimalInjectionAttempt[] = [];
  const seenMarkups = new Set<string>();
  const rulesToTry = spec.rules ?? [];
  const suffixesToTry = spec.suffixes ?? [];

  if (rulesToTry.length > 0) {
    for (const rule of rulesToTry) {
      if (rule.contexts && !rule.contexts.includes(contextTag)) continue;
      if (rule.find.test(trimmed)) {
        const replacement = expandRuleTemplate(rule.replace, entry.label);
        const mutatedMarkup = trimmed.replace(rule.find, replacement);
        if (mutatedMarkup !== trimmed && !seenMarkups.has(mutatedMarkup)) {
          seenMarkups.add(mutatedMarkup);
          results.push({
            mutatedMarkup,
            reason: expandRuleTemplate(
              rule.reason ?? `Applied ${entry.label} rewrite rule`,
              entry.label
            ),
            fitScore: rule.score,
            source: "rule",
          });
        }
      }
    }
  }

  if (includeGenericSuffixes && suffixesToTry.length > 0 && /\.$/.test(trimmed)) {
    for (const suf of suffixesToTry) {
      if (suf.contexts && !suf.contexts.includes(contextTag)) continue;
      if (suf.requiresVerb && !suf.requiresVerb.test(trimmed)) continue;
      const expandedSuffix = expandRuleTemplate(suf.suffix, entry.label);
      const mutatedMarkup = trimmed.replace(/\.$/, `${expandedSuffix}.`);
      if (mutatedMarkup !== trimmed && !seenMarkups.has(mutatedMarkup)) {
        seenMarkups.add(mutatedMarkup);
        results.push({
          mutatedMarkup,
          reason: expandRuleTemplate(
            suf.reason ?? `Appended ${entry.label} suffix`,
            entry.label
          ),
          fitScore: suf.score,
          source: "generic",
        });
      }
    }
  }

  return results;
}
