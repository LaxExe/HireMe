import { db, isFirebaseConfigured } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { LarpAlignmentRun } from "./larpEngine";
import type { MasterResume } from "./types";
import { uid } from "./utils";

export interface PreviewQueueItem {
  id: string;
  roleName: string;
  roleUrl: string;
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
const PREVIEW_QUEUE_GLOBAL_KEY = "hireme_preview_queue_global";

function normalizeQueueItems(parsed: unknown): PreviewQueueItem[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw) => {
    const item = raw as Partial<PreviewQueueItem>;
    const roleName = item.roleName || item.title || "Software Engineer Role";
    return {
      id: item.id || uid("pv"),
      roleName,
      roleUrl: item.roleUrl || "",
      title: item.title || roleName,
      createdAt: item.createdAt || new Date().toISOString(),
      jobDescription: item.jobDescription || "",
      baseResume: item.baseResume as MasterResume,
      larpRun: item.larpRun as LarpAlignmentRun,
      acceptedBulletIds: Array.isArray(item.acceptedBulletIds) ? item.acceptedBulletIds : [],
      acceptedMalleableIds: Array.isArray(item.acceptedMalleableIds)
        ? item.acceptedMalleableIds
        : [],
      selectedMalleableOptionBySlotId: item.selectedMalleableOptionBySlotId || {},
      applySkillsSwap: item.applySkillsSwap ?? true,
    };
  });
}

export function loadPreviewQueue(uidStr: string): PreviewQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const rawUser = uidStr ? localStorage.getItem(PREVIEW_QUEUE_KEY(uidStr)) : null;
    if (rawUser) {
      const items = normalizeQueueItems(JSON.parse(rawUser));
      if (items.length > 0) return items;
    }
    const rawGlobal = localStorage.getItem(PREVIEW_QUEUE_GLOBAL_KEY);
    if (rawGlobal) {
      return normalizeQueueItems(JSON.parse(rawGlobal));
    }
    return [];
  } catch {
    return [];
  }
}

export async function loadPreviewQueueAsync(uidStr: string): Promise<PreviewQueueItem[]> {
  const local = loadPreviewQueue(uidStr);
  if (local.length > 0) return local;

  if (isFirebaseConfigured && uidStr) {
    try {
      const snap = await getDoc(doc(db, "previewQueues", uidStr));
      if (snap.exists()) {
        const data = snap.data().data;
        if (typeof data === "string") {
          const items = normalizeQueueItems(JSON.parse(data));
          savePreviewQueue(uidStr, items);
          return items;
        }
      }
    } catch (e) {
      console.warn("Firestore preview queue read failed, using local copy:", e);
    }
  }
  return local;
}

export function savePreviewQueue(uidStr: string, items: PreviewQueueItem[]): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(items);
  try {
    if (uidStr) {
      localStorage.setItem(PREVIEW_QUEUE_KEY(uidStr), serialized);
    }
    localStorage.setItem(PREVIEW_QUEUE_GLOBAL_KEY, serialized);
  } catch (e) {
    console.warn("Failed to save preview queue to localStorage:", e);
  }

  if (isFirebaseConfigured && uidStr) {
    setDoc(doc(db, "previewQueues", uidStr), {
      data: serialized,
      updatedAt: new Date().toISOString(),
    }).catch((e) => {
      console.warn("Firestore preview queue sync skipped:", e);
    });
  }
}

function inferJdTitle(roleName: string, jobDescription: string, index: number): string {
  if (roleName && roleName.trim().length > 0) {
    return roleName.trim();
  }
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
    roleName?: string;
    roleUrl?: string;
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
  const resolvedTitle = inferJdTitle(
    params.roleName || "",
    params.jobDescription,
    existing.length + 1
  );
  const newItem: PreviewQueueItem = {
    id: uid("pv"),
    roleName: resolvedTitle,
    roleUrl: (params.roleUrl || "").trim(),
    title: resolvedTitle,
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
      | "roleName"
      | "roleUrl"
      | "larpRun"
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
