import type { Tier } from "./types";

export interface LedgerEntry {
  kind: "bullet_edit" | "new_bullet" | "skill_added";
  keyword: string;
  tier: Tier | "custom";
  where: string;
  before?: string;
  after: string;
  source: "rule" | "generic" | "llm" | "template";
  confidence?: number;
  wordsChanged?: number;
}
