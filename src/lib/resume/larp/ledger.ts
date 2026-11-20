import { findCatalogEntry } from "./catalog";
import { DEFAULT_LLM_MODEL, PROMPT_VERSION } from "./llm";
import type {
  BulletMutationProposal,
  LarpTierClassification,
  MalleableSynthesizedBullet,
  PolicyMode,
  SkillSwapChange,
  Tier,
} from "./types";

export interface LedgerEntry {
  kind: "bullet_edit" | "new_bullet" | "skill_added";
  keyword: string;
  tier: Tier | "custom";
  where: string;
  before?: string;
  after: string;
  source: "rule" | "generic" | "llm" | "template" | "default";
  confidence?: number;
  wordsChanged?: number;
}

export interface LarpRunMetadata {
  jdId: string;
  mode: PolicyMode;
  model: string;
  promptVersion: string;
  timestamp: string;
  synthetic: true;
}

export interface LarpUserActionEvent {
  id: string;
  timestamp: string;
  action: "accept" | "reject" | "edit";
  targetKind: "bullet_edit" | "new_bullet" | "skill_added";
  targetId: string;
  keyword?: string;
  beforeText?: string;
  afterText?: string;
  jdId?: string;
}

const USER_EVENTS_STORAGE_KEY = "hireme_alignment_events";
const inMemoryEvents: LarpUserActionEvent[] = [];

export function resolveTierForKeyword(
  keyword: string,
  tiers?: LarpTierClassification
): Tier | "custom" {
  const lower = keyword.toLowerCase();
  if (tiers) {
    if (tiers.tier_0_workflow.some((k) => k.toLowerCase() === lower)) return "tier_0_workflow";
    if (tiers.tier_1_framing.some((k) => k.toLowerCase() === lower)) return "tier_1_framing";
    if (tiers.tier_1_5_skills_only.some((k) => k.toLowerCase() === lower))
      return "tier_1_5_skills_only";
    if (tiers.tier_2_banned.some((k) => k.toLowerCase() === lower)) return "tier_2_banned";
  }
  const entry = findCatalogEntry(keyword);
  return entry?.tier ?? "custom";
}

/**
 * Builds the machine-readable study ledger recording every injected claim
 * across skills, bullet edits, and malleable 1-line bullets.
 */
export function buildRunLedger(params: {
  tiers: LarpTierClassification;
  skillSwaps: SkillSwapChange[];
  bulletProposals: BulletMutationProposal[];
  malleableBullets: MalleableSynthesizedBullet[];
}): LedgerEntry[] {
  const { tiers, skillSwaps, bulletProposals, malleableBullets } = params;
  const ledger: LedgerEntry[] = [];

  // 1. Skills added
  for (const swap of skillSwaps) {
    for (const skillName of swap.added) {
      ledger.push({
        kind: "skill_added",
        keyword: skillName,
        tier: resolveTierForKeyword(skillName, tiers),
        where: `Skills · ${swap.categoryName}`,
        before: swap.swappedOut.length > 0 ? swap.swappedOut.join(", ") : undefined,
        after: skillName,
        source: "rule",
        confidence: 100,
        wordsChanged: 1,
      });
    }
  }

  // 2. Bullet edits
  for (const bp of bulletProposals) {
    const kw = bp.injectedKeywords[0] ?? "Unknown";
    ledger.push({
      kind: "bullet_edit",
      keyword: kw,
      tier: resolveTierForKeyword(kw, tiers),
      where: `${bp.containerTitle} (${bp.bulletId})`,
      before: bp.originalMarkup,
      after: bp.mutatedMarkup,
      source: bp.source ?? "rule",
      confidence: bp.totalScore ?? bp.scoreFeatures?.total ?? 95,
      wordsChanged: bp.wordStats.reframedWords,
    });
  }

  // 3. Malleable new bullets
  for (const mb of malleableBullets) {
    const kw = mb.injectedKeywords[0] ?? "Tools";
    const primaryOpt = mb.options[0];
    ledger.push({
      kind: "new_bullet",
      keyword: mb.injectedKeywords.join(", "),
      tier: resolveTierForKeyword(kw, tiers),
      where: `${mb.targetContainerTitle} (${mb.id})`,
      after: mb.markup,
      source: primaryOpt?.source ?? "template",
      confidence: mb.believabilityScore,
      wordsChanged: mb.markup.trim().split(/\s+/).length,
    });
  }

  return ledger;
}

export function buildRunMetadata(params?: {
  jdId?: string;
  jobDescription?: string;
  mode?: PolicyMode;
  model?: string;
  promptVersion?: string;
  timestamp?: string;
}): LarpRunMetadata {
  const firstLine = params?.jobDescription?.trim().split(/\r?\n/)[0]?.slice(0, 48) || "jd";
  const slug = firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  return {
    jdId: params?.jdId || slug || "jd_run",
    mode: params?.mode ?? "framing",
    model: params?.model ?? DEFAULT_LLM_MODEL,
    promptVersion: params?.promptVersion ?? PROMPT_VERSION,
    timestamp: params?.timestamp ?? new Date().toISOString(),
    synthetic: true,
  };
}

export function exportLedgerToJson(
  ledger: LedgerEntry[],
  metadata: LarpRunMetadata,
  events: LarpUserActionEvent[] = getLarpUserEvents()
): string {
  return JSON.stringify(
    {
      synthetic: true,
      metadata,
      ledgerCount: ledger.length,
      ledger,
      userEvents: events,
    },
    null,
    2
  );
}

function escapeCsvCell(val: string | number | undefined): string {
  if (val === undefined || val === null) return "";
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportLedgerToCsv(
  ledger: LedgerEntry[],
  metadata: LarpRunMetadata
): string {
  const headers = [
    "jdId",
    "mode",
    "model",
    "promptVersion",
    "timestamp",
    "synthetic",
    "kind",
    "keyword",
    "tier",
    "where",
    "source",
    "confidence",
    "wordsChanged",
    "before",
    "after",
  ];

  const rows = ledger.map((entry) =>
    [
      metadata.jdId,
      metadata.mode,
      metadata.model,
      metadata.promptVersion,
      metadata.timestamp,
      "true",
      entry.kind,
      entry.keyword,
      entry.tier,
      entry.where,
      entry.source,
      entry.confidence ?? "",
      entry.wordsChanged ?? "",
      entry.before ?? "",
      entry.after,
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export function logLarpUserActionEvent(
  event: Omit<LarpUserActionEvent, "id" | "timestamp">
): LarpUserActionEvent {
  const full: LarpUserActionEvent = {
    ...event,
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  inMemoryEvents.push(full);
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(USER_EVENTS_STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as LarpUserActionEvent[]) : [];
      list.push(full);
      localStorage.setItem(USER_EVENTS_STORAGE_KEY, JSON.stringify(list.slice(-500)));
    } catch {
      // ignore storage errors
    }
  }
  return full;
}

export function getLarpUserEvents(): LarpUserActionEvent[] {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(USER_EVENTS_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as LarpUserActionEvent[];
    } catch {
      // fallback to inMemoryEvents
    }
  }
  return [...inMemoryEvents];
}

export function formatSyntheticResumeFilename(baseName: string): string {
  const clean = baseName.trim().replace(/\.(pdf|tex|json)$/i, "") || "Resume";
  if (/synthetic/i.test(clean)) return clean;
  return `${clean}_SYNTHETIC_LARP`;
}
