import type { CatalogItem, PolicyMode, Tier } from "./types";

export type PlacementDecision = "bullet" | "skills" | "blocked" | "confirm";

export function defaultTierPlacement(tier: Tier, mode: PolicyMode = "framing"): PlacementDecision {
  if (tier === "tier_0_workflow") return "bullet";
  if (tier === "tier_1_framing") return mode === "framing" ? "bullet" : "confirm";
  if (tier === "tier_1_5_skills_only") return "skills";
  return "blocked";
}

export function getCentralizedTargetKeywords(
  tier1Framing: string[],
  tier0Workflow: string[]
): string[] {
  return [...tier1Framing, ...tier0Workflow.slice(0, 1)];
}

export type { CatalogItem };
