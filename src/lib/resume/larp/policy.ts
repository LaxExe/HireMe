import { plainText, splitItems } from "../utils";
import { findCatalogEntry } from "./catalog";
import { containsPhrase } from "./text";
import type { CatalogEntry, MasterResume, PolicyMode } from "./types";

export type PlacementDecision = "bullet" | "skills" | "blocked" | "confirm";

export interface ResumeInventory {
  presentTechIds: Set<string>;
  presentTechLabelsLower: Set<string>;
  bulletTechLabelsLower: Set<string>;
}

export function buildResumeInventory(resume: MasterResume): ResumeInventory {
  const presentTechIds = new Set<string>();
  const presentTechLabelsLower = new Set<string>();
  const bulletTechLabelsLower = new Set<string>();

  const skillItems = resume.skills.flatMap((c) =>
    c.skills.flatMap((s) => [s.name, ...splitItems(s.name)])
  );
  const stackItems = resume.projects.flatMap((p) =>
    p.techStack.flatMap((t) => [t, ...splitItems(t)])
  );
  const bulletTexts: string[] = [];
  for (const j of resume.experience) {
    for (const b of j.bullets) {
      bulletTexts.push(plainText(b.text));
    }
  }
  for (const p of resume.projects) {
    for (const b of p.bullets) {
      bulletTexts.push(plainText(b.text));
    }
  }
  const combinedBullets = bulletTexts.join(" \n ");

  for (const raw of [...skillItems, ...stackItems]) {
    const clean = raw.trim();
    if (!clean) continue;
    presentTechLabelsLower.add(clean.toLowerCase());
    const entry = findCatalogEntry(clean);
    if (entry) {
      presentTechIds.add(entry.id);
      presentTechLabelsLower.add(entry.label.toLowerCase());
    }
  }

  for (const raw of [...skillItems, ...stackItems]) {
    const clean = raw.trim();
    if (!clean) continue;
    if (containsPhrase(combinedBullets, clean)) {
      bulletTechLabelsLower.add(clean.toLowerCase());
      const entry = findCatalogEntry(clean);
      if (entry) {
        presentTechIds.add(entry.id);
        bulletTechLabelsLower.add(entry.label.toLowerCase());
      }
    }
  }

  return {
    presentTechIds,
    presentTechLabelsLower,
    bulletTechLabelsLower,
  };
}

/**
 * Evaluates where a catalog entry belongs under the active `PolicyMode` ('framing' vs 'evidence').
 * - if the tech is already on the resume -> 'bullet' (strong evidence) or 'skills'
 * - tier 0 -> 'bullet'
 * - tier 1 -> 'bullet' in framing mode; in evidence mode, 'confirm' if adjacent tech is strong, else 'blocked'
 * - tier 1.5 -> 'skills'
 * - tier 2 -> 'blocked'
 */
export function placementFor(
  entry: CatalogEntry,
  inventory: ResumeInventory,
  mode: PolicyMode = "framing"
): PlacementDecision {
  const isPresent =
    inventory.presentTechIds.has(entry.id) ||
    inventory.presentTechLabelsLower.has(entry.label.toLowerCase()) ||
    entry.aliases.some((a) => inventory.presentTechLabelsLower.has(a.toLowerCase()));

  if (isPresent) {
    const inBullets =
      inventory.bulletTechLabelsLower.has(entry.label.toLowerCase()) ||
      entry.aliases.some((a) => inventory.bulletTechLabelsLower.has(a.toLowerCase()));
    return inBullets ? "bullet" : "skills";
  }

  if (entry.tier === "tier_0_workflow") {
    return "bullet";
  }

  if (entry.tier === "tier_1_framing") {
    if (mode === "framing") {
      return "bullet";
    }
    const hasStrongAdjacent = (entry.adjacentTo ?? []).some(
      (adjId) =>
        inventory.presentTechIds.has(adjId) ||
        inventory.presentTechLabelsLower.has(adjId.toLowerCase())
    );
    return hasStrongAdjacent ? "confirm" : "blocked";
  }

  if (entry.tier === "tier_1_5_skills_only") {
    return "skills";
  }

  return "blocked";
}

export function getCentralizedTargetKeywords(
  tier1Framing: string[],
  tier0Workflow: string[]
): string[] {
  return [...tier1Framing, ...tier0Workflow.slice(0, 1)];
}
