import type { LarpAlignmentRun } from "./larpEngine";
import type { MasterResume } from "./types";
import { uid } from "./utils";

export interface PreviewQueueItem {
  id: string;
  title: string;
  createdAt: string;
  jobDescription: string;
  baseResume: MasterResume;
  larpRun: LarpAlignmentRun;
  acceptedBulletIds: string[];
  acceptedMalleableIds: string[];
  selectedMalleableOptionBySlotId: Record<string, string>;
  applySkillsSwap: boolean;
}

const PREVIEW_QUEUE_KEY = (uidStr: string) => `hireme_preview_queue_${uidStr}`;

export function loadPreviewQueue(uidStr: string): PreviewQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREVIEW_QUEUE_KEY(uidStr));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePreviewQueue(uidStr: string, items: PreviewQueueItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREVIEW_QUEUE_KEY(uidStr), JSON.stringify(items));
  } catch (e) {
    console.warn("Failed to save preview queue to localStorage:", e);
  }
}

function inferJdTitle(jobDescription: string, index: number): string {
  const firstLine =
    jobDescription
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) || "";
  if (firstLine.length > 0) {
    return firstLine.length > 56 ? `${firstLine.slice(0, 56)}…` : firstLine;
  }
  return `Tailored Resume Slot #${index}`;
}

export function enqueuePreviewItem(
  uidStr: string,
  params: {
    jobDescription: string;
    baseResume: MasterResume;
    larpRun: LarpAlignmentRun;
    acceptedBulletIds: string[];
    acceptedMalleableIds: string[];
    selectedMalleableOptionBySlotId: Record<string, string>;
    applySkillsSwap: boolean;
  }
): PreviewQueueItem {
  const existing = loadPreviewQueue(uidStr);
  const newItem: PreviewQueueItem = {
    id: uid("pv"),
    title: inferJdTitle(params.jobDescription, existing.length + 1),
    createdAt: new Date().toISOString(),
    jobDescription: params.jobDescription,
    baseResume: structuredClone(params.baseResume),
    larpRun: structuredClone(params.larpRun),
    acceptedBulletIds: [...params.acceptedBulletIds],
    acceptedMalleableIds: [...params.acceptedMalleableIds],
    selectedMalleableOptionBySlotId: { ...params.selectedMalleableOptionBySlotId },
    applySkillsSwap: params.applySkillsSwap,
  };
  const updated = [newItem, ...existing];
  savePreviewQueue(uidStr, updated);
  return newItem;
}

export function updatePreviewQueueItem(
  uidStr: string,
  itemId: string,
  patch: Partial<
    Pick<
      PreviewQueueItem,
      | "title"
      | "acceptedBulletIds"
      | "acceptedMalleableIds"
      | "selectedMalleableOptionBySlotId"
      | "applySkillsSwap"
    >
  >
): PreviewQueueItem[] {
  const existing = loadPreviewQueue(uidStr);
  const updated = existing.map((item) =>
    item.id === itemId ? { ...item, ...patch } : item
  );
  savePreviewQueue(uidStr, updated);
  return updated;
}

export function deletePreviewQueueItem(uidStr: string, itemId: string): PreviewQueueItem[] {
  const existing = loadPreviewQueue(uidStr);
  const updated = existing.filter((item) => item.id !== itemId);
  savePreviewQueue(uidStr, updated);
  return updated;
}
