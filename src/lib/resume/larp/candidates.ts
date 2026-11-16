import { plainText } from "../utils";
import { findCatalogEntry } from "./catalog";
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
  reason?: "systems_context" | "implausible_slot";
}

/**
 * Hard plausibility gate evaluated BEFORE generating candidates for a `(bulletSlot, keyword)` pair.
 * - Never injects into `systems-cpp-robotics` bullets.
 * - `ok = tier_0 OR bullet/container already uses a tech in entry.pairsWith OR entry.contexts overlaps the bullet's tags`
 */
export function checkSlotPlausibility(
  slot: Pick<CandidateBulletSlot, "bullet" | "context" | "tags" | "containerStack">,
  keywordOrId: string
): PlausibilityCheckResult {
  if (slot.context === "systems-cpp-robotics" || slot.tags.includes("systems")) {
    return {
      ok: false,
      pairsWithHit: false,
      contextOverlap: false,
      reason: "systems_context",
    };
  }

  const entry = findCatalogEntry(keywordOrId);
  if (!entry) {
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

  const pairsWithHit = (entry.pairsWith ?? []).some((pw) =>
    containsPhrase(bulletAndStackText, pw)
  );
  const contextOverlap = (entry.contexts ?? []).some((ctx) => slot.tags.includes(ctx));
  const isTier0 = entry.tier === "tier_0_workflow";

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
  allowGenericSuffixFallback = false
): MinimalInjectionAttempt | null {
  if (context === "systems-cpp-robotics") return null;
  if (containsPhrase(plainText(origMarkup), keyword)) return null;

  const trimmed = origMarkup.trim();
  const entry = findCatalogEntry(keyword);
  if (!entry) return null;

  const contextTag = bulletDomainContextToTag(context);

  if (entry.rules && entry.rules.length > 0) {
    for (const rule of entry.rules) {
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

  if (allowGenericSuffixFallback && entry.suffixes && entry.suffixes.length > 0 && /\.$/.test(trimmed)) {
    for (const suf of entry.suffixes) {
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
  includeGenericSuffixes = true
): MinimalInjectionAttempt[] {
  if (context === "systems-cpp-robotics") return [];
  if (containsPhrase(plainText(origMarkup), keyword)) return [];

  const trimmed = origMarkup.trim();
  const entry = findCatalogEntry(keyword);
  if (!entry) return [];

  const contextTag = bulletDomainContextToTag(context);
  const results: MinimalInjectionAttempt[] = [];
  const seenMarkups = new Set<string>();

  if (entry.rules) {
    for (const rule of entry.rules) {
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

  if (includeGenericSuffixes && entry.suffixes && /\.$/.test(trimmed)) {
    for (const suf of entry.suffixes) {
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
