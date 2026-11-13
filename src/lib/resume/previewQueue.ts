import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, set } from "firebase/database";
import type { LarpAlignmentRun } from "./larpEngine";
import type { MasterResume } from "./types";
import { uid } from "./utils";
import { loadAgentsQueue } from "./agentsQueue";

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
  selectedSkillNames: string[];
  customSkillCategoryByName: Record<string, string>;
  pushedToAgentsAt?: string;
}

const PREVIEW_QUEUE_KEY = (uidStr: string) => `hireme_preview_queue_${uidStr}`;
const PREVIEW_QUEUE_GLOBAL_KEY = "hireme_preview_queue_global";

function normalizeQueueItems(parsed: unknown): PreviewQueueItem[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw) => {
    const item = raw as Partial<PreviewQueueItem>;
    const roleName = item.roleName || item.title || "Software Engineer Role";
    const applySkillsSwap = item.applySkillsSwap ?? true;
    const defaultSkillNames =
      applySkillsSwap && item.larpRun?.skillSwaps
        ? item.larpRun.skillSwaps.flatMap((s) => s.added)
        : [];
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
      applySkillsSwap,
      selectedSkillNames: Array.isArray(item.selectedSkillNames)
        ? item.selectedSkillNames
        : defaultSkillNames,
      customSkillCategoryByName: item.customSkillCategoryByName || {},
      pushedToAgentsAt: item.pushedToAgentsAt,
    };
  });
}

export function loadPreviewQueue(uidStr: string): PreviewQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const pushedIds = new Set(
      loadAgentsQueue(uidStr)
        .map((a) => a.sourcePreviewId)
        .filter(Boolean)
    );

    let items: PreviewQueueItem[] = [];
    const rawUser = uidStr ? localStorage.getItem(PREVIEW_QUEUE_KEY(uidStr)) : null;
    if (rawUser !== null) {
      items = normalizeQueueItems(JSON.parse(rawUser));
    } else {
      const rawGlobal = localStorage.getItem(PREVIEW_QUEUE_GLOBAL_KEY);
      if (rawGlobal !== null) {
        items = normalizeQueueItems(JSON.parse(rawGlobal));
      }
    }

    // Filter out any items that have been pushed to agents
    const unpushed = items.filter(
      (item) => !item.pushedToAgentsAt && !pushedIds.has(item.id)
    );

    // If pushed items were pruned, persist the cleaned queue
    if (unpushed.length !== items.length) {
      savePreviewQueue(uidStr, unpushed);
    }

    return unpushed;
  } catch {
    return [];
  }
}

export async function loadPreviewQueueAsync(uidStr: string): Promise<PreviewQueueItem[]> {
  const rawUser =
    typeof window !== "undefined" && uidStr
      ? localStorage.getItem(PREVIEW_QUEUE_KEY(uidStr))
      : null;

  // If this device already has an established local state for this user (even if 0 items), use it
  if (rawUser !== null) {
    return loadPreviewQueue(uidStr);
  }

  if (isFirebaseConfigured && uidStr) {
    try {
      const snap = await get(ref(rtdb, `previewQueues/${uidStr}`));
      if (snap.exists()) {
        const val = snap.val();
        const data = val?.data;
        if (typeof data === "string") {
          const items = normalizeQueueItems(JSON.parse(data));
          const pushedIds = new Set(
            loadAgentsQueue(uidStr)
              .map((a) => a.sourcePreviewId)
              .filter(Boolean)
          );
          const unpushed = items.filter(
            (item) => !item.pushedToAgentsAt && !pushedIds.has(item.id)
          );
          savePreviewQueue(uidStr, unpushed);
          return unpushed;
        }
      }
    } catch (e) {
      console.warn("RTDB preview queue read failed, using local copy:", e);
    }
  }
  return loadPreviewQueue(uidStr);
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
    set(ref(rtdb, `previewQueues/${uidStr}`), {
      data: serialized,
      updatedAt: new Date().toISOString(),
    }).catch((e) => {
      console.warn("RTDB preview queue sync skipped:", e);
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
    selectedSkillNames?: string[];
    customSkillCategoryByName?: Record<string, string>;
  }
): PreviewQueueItem {
  const existing = loadPreviewQueue(uidStr);
  const resolvedTitle = inferJdTitle(
    params.roleName || "",
    params.jobDescription,
    existing.length + 1
  );
  const defaultSkillNames = params.selectedSkillNames
    ? [...params.selectedSkillNames]
    : params.applySkillsSwap
      ? params.larpRun.skillSwaps.flatMap((s) => s.added)
      : [];
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
    selectedSkillNames: defaultSkillNames,
    customSkillCategoryByName: { ...(params.customSkillCategoryByName || {}) },
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
      | "selectedSkillNames"
      | "customSkillCategoryByName"
      | "pushedToAgentsAt"
    >
  >
): PreviewQueueItem[] {
  const existing = loadPreviewQueue(uidStr);
  const updated = existing.map((item) => {
    if (item.id !== itemId) return item;
    const syncedPatch =
      patch.selectedSkillNames !== undefined && patch.applySkillsSwap === undefined
        ? { ...patch, applySkillsSwap: patch.selectedSkillNames.length > 0 }
        : patch;
    return { ...item, ...syncedPatch };
  });
  savePreviewQueue(uidStr, updated);
  return updated;
}

export function deletePreviewQueueItem(uidStr: string, itemId: string): PreviewQueueItem[] {
  const existing = loadPreviewQueue(uidStr);
  const updated = existing.filter((item) => item.id !== itemId);
  savePreviewQueue(uidStr, updated);
  return updated;
}
