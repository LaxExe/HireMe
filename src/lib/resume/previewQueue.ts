import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, update, onValue } from "firebase/database";
import { isOnline, enqueueOfflineItem } from "@/lib/offlineSync";
import { logAppliedJobToFirebase } from "@/lib/resume/agentsQueue";
import { applyLakshmanHeaderToResume, isLakshmanAccount } from "./headerMigration";
import { buildCompanyDefaultPicksMap } from "./defaultMalleablePicks";
import {
  FOCUSED_ALIGNMENT_PROMPT_VERSION,
  runLarpAlignmentPipeline,
  type LarpAlignmentRun,
} from "./larpEngine";
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

const memoryPreviewQueue: Record<string, PreviewQueueItem[]> = {};
const cloudPreviewLoaded: Record<string, boolean> = {};

function writeLocalPreviewCache(uidStr: string, serialized: string): void {
  if (typeof window === "undefined" || !uidStr) return;
  try {
    // Remove legacy duplicate global copy to avoid doubling localStorage footprint
    localStorage.removeItem(PREVIEW_QUEUE_GLOBAL_KEY);
  } catch {}
  try {
    localStorage.setItem(PREVIEW_QUEUE_KEY(uidStr), serialized);
  } catch (e) {
    console.warn("Preview queue exceeded localStorage quota (Firebase RTDB remains intact):", e);
  }
}

export function getCachedPreviewQueue(uidStr: string): PreviewQueueItem[] {
  if (uidStr && memoryPreviewQueue[uidStr] && memoryPreviewQueue[uidStr].length > 0) {
    return memoryPreviewQueue[uidStr];
  }
  return loadPreviewQueue(uidStr);
}

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

function migratePreviewItemsIfNeeded(
  uidStr: string,
  items: PreviewQueueItem[]
): { items: PreviewQueueItem[]; changed: boolean } {
  const isLakshman = isLakshmanAccount(uidStr);
  let changed = false;

  const migrated = items.map((item) => {
    if (!item?.baseResume) return item;
    let nextBase = item.baseResume;
    let itemChanged = false;

    if (isLakshman) {
      const headerRes = applyLakshmanHeaderToResume(nextBase);
      if (headerRes.changed) {
        nextBase = headerRes.resume;
        itemChanged = true;
      }
    }

    const hasLlmProposals =
      item.larpRun?.bulletProposals?.some((bp) => bp.source === "llm") ||
      item.larpRun?.malleableBullets?.some((mb) =>
        mb.options?.some((o) => o.source === "llm")
      );
    const needsFocusedUpgrade =
      Boolean(item.jobDescription?.trim()) &&
      !hasLlmProposals &&
      item.larpRun?.runMetadata?.promptVersion !== FOCUSED_ALIGNMENT_PROMPT_VERSION;

    if (needsFocusedUpgrade) {
      const defaultMap = buildCompanyDefaultPicksMap(nextBase, uidStr);
      const freshRun = runLarpAlignmentPipeline(item.jobDescription, nextBase, {
        jdId: item.roleName || item.title || item.id,
        mode: "framing",
        focusedRecommendations: true,
        defaultPicksByCompanyKey: defaultMap,
      });

      const validBulletSet = new Set(freshRun.bulletProposals.map((p) => p.bulletId));
      const keptBullets = item.acceptedBulletIds.filter((id) => validBulletSet.has(id));
      const prevProposalIds = new Set(
        (item.larpRun?.bulletProposals ?? []).map((p) => p.bulletId)
      );
      const newlyDiscoveredBullets = freshRun.bulletProposals
        .filter((p) => !prevProposalIds.has(p.bulletId))
        .map((p) => p.bulletId);
      const nextAcceptedBulletIds = Array.from(
        new Set(
          keptBullets.length > 0
            ? [...keptBullets, ...newlyDiscoveredBullets]
            : freshRun.bulletProposals.map((p) => p.bulletId)
        )
      );

      const recommendedSkillAdds = freshRun.skillSwaps.flatMap((s) => s.added);
      const existingSkillKeys = new Set(
        (item.selectedSkillNames ?? []).map((s) => s.toLowerCase())
      );
      const nextSelectedSkillNames =
        item.applySkillsSwap === false
          ? item.selectedSkillNames
          : [
              ...(item.selectedSkillNames ?? []),
              ...recommendedSkillAdds.filter((s) => !existingSkillKeys.has(s.toLowerCase())),
            ];

      const recommendedMalleableIds = freshRun.malleableBullets
        .filter((m, idx) => idx === 0 || m.recommended)
        .slice(0, 2)
        .map((m) => m.id);
      const nextAcceptedMalleableIds =
        recommendedMalleableIds.length > 0
          ? recommendedMalleableIds
          : freshRun.malleableBullets.slice(0, 1).map((m) => m.id);

      const nextSelectedOpts: Record<string, string> = {};
      for (const mb of freshRun.malleableBullets) {
        const prevSelected = item.selectedMalleableOptionBySlotId?.[mb.id];
        if (prevSelected && prevSelected.includes("default")) {
          const defOpt = mb.options.find(
            (o) => o.isDefaultPick || o.source === "default"
          );
          if (defOpt) {
            nextSelectedOpts[mb.id] = defOpt.id;
            continue;
          }
        }
        if (mb.options[0]) {
          nextSelectedOpts[mb.id] = mb.options[0].id;
        }
      }

      changed = true;
      return {
        ...item,
        baseResume: nextBase,
        larpRun: freshRun,
        acceptedBulletIds: nextAcceptedBulletIds,
        selectedSkillNames: nextSelectedSkillNames,
        acceptedMalleableIds: nextAcceptedMalleableIds,
        selectedMalleableOptionBySlotId: nextSelectedOpts,
      };
    }

    if (itemChanged) {
      changed = true;
      return { ...item, baseResume: nextBase };
    }
    return item;
  });

  return { items: migrated, changed };
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

    const { items: migrated, changed } = migratePreviewItemsIfNeeded(uidStr, unpushed);

    // If pushed items were pruned, persist the cleaned queue
    if (unpushed.length !== items.length) {
      savePreviewQueue(uidStr, migrated);
    } else if (changed && uidStr) {
      writeLocalPreviewCache(uidStr, JSON.stringify(migrated));
    }

    return migrated;
  } catch {
    return [];
  }
}

export async function loadPreviewQueueAsync(uidStr: string): Promise<PreviewQueueItem[]> {
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
          const { items: migrated, changed } = migratePreviewItemsIfNeeded(uidStr, unpushed);
          memoryPreviewQueue[uidStr] = migrated;
          cloudPreviewLoaded[uidStr] = true;
          if (changed) {
            savePreviewQueue(uidStr, migrated);
          } else {
            writeLocalPreviewCache(uidStr, JSON.stringify(migrated));
          }
          return migrated;
        }
      }
      cloudPreviewLoaded[uidStr] = true;
    } catch (e) {
      console.warn("RTDB preview queue read failed, using local copy:", e);
    }
  }
  return loadPreviewQueue(uidStr);
}

/**
 * Subscribes to live real-time updates from Firebase Realtime Database for preview items.
 * Immediately yields local cache, then streams live cloud changes across devices.
 */
export function subscribePreviewQueue(
  uidStr: string,
  callback: (items: PreviewQueueItem[]) => void
): () => void {
  if (typeof window === "undefined" || !uidStr) return () => {};

  // Instant local cache paint for zero-flicker UI
  const local = getCachedPreviewQueue(uidStr);
  if (local.length > 0) {
    callback(local);
  }

  if (isFirebaseConfigured && uidStr) {
    try {
      const qRef = ref(rtdb, `previewQueues/${uidStr}`);
      const unsubscribe = onValue(
        qRef,
        (snap) => {
          try {
            if (snap.exists()) {
              const val = snap.val();
              const data = val?.data;
              if (typeof data === "string") {
                const remoteItems = normalizeQueueItems(JSON.parse(data));
                const pushedIds = new Set(
                  loadAgentsQueue(uidStr)
                    .map((a) => a.sourcePreviewId)
                    .filter(Boolean)
                );
                const unpushed = remoteItems.filter(
                  (item) => !item.pushedToAgentsAt && !pushedIds.has(item.id)
                );
                const { items: migrated, changed } = migratePreviewItemsIfNeeded(uidStr, unpushed);
                memoryPreviewQueue[uidStr] = migrated;
                cloudPreviewLoaded[uidStr] = true;
                callback(migrated);
                if (changed) {
                  savePreviewQueue(uidStr, migrated);
                } else {
                  writeLocalPreviewCache(uidStr, JSON.stringify(migrated));
                }
                return;
              }
            }
            cloudPreviewLoaded[uidStr] = true;
            if (!snap.exists()) {
              const currentLocal = getCachedPreviewQueue(uidStr);
              if (currentLocal.length > 0) {
                // Automatically sync existing local items up to the cloud database!
                savePreviewQueue(uidStr, currentLocal);
                callback(currentLocal);
              } else {
                memoryPreviewQueue[uidStr] = [];
                callback([]);
              }
            }
          } catch (err) {
            console.warn("Error processing RTDB preview queue snapshot:", err);
          }
        },
        (error) => {
          console.warn("Live RTDB preview queue sync warning:", error);
        }
      );
      return unsubscribe;
    } catch (e) {
      console.warn("Could not attach RTDB preview queue listener:", e);
    }
  }

  return () => {};
}

export function savePreviewQueue(uidStr: string, items: PreviewQueueItem[]): void {
  if (typeof window === "undefined" || !uidStr) return;
  memoryPreviewQueue[uidStr] = items;
  const serialized = JSON.stringify(items);
  const now = new Date().toISOString();

  // Best-effort local storage cache (never blocks RTDB sync on quota exceeded)
  writeLocalPreviewCache(uidStr, serialized);

  // If online and Firebase is configured, update only data/updatedAt so dbViewerStore is preserved
  if (isOnline() && isFirebaseConfigured) {
    update(ref(rtdb, `previewQueues/${uidStr}`), {
      data: serialized,
      updatedAt: now,
    }).catch((e) => {
      console.warn("RTDB preview queue direct sync failed, falling back to offline queue:", e);
      enqueueOfflineItem({
        type: "previewQueue",
        uid: uidStr,
        data: serialized,
        timestamp: now,
      });
    });
  } else {
    // Offline mode: queue for upload when WiFi returns
    enqueueOfflineItem({
      type: "previewQueue",
      uid: uidStr,
      data: serialized,
      timestamp: now,
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
  },
  currentQueue?: PreviewQueueItem[]
): PreviewQueueItem {
  const cached = getCachedPreviewQueue(uidStr);
  const existing =
    currentQueue && currentQueue.length > 0
      ? currentQueue
      : cached.length > 0
        ? cached
        : currentQueue ?? [];
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
  const updated = [newItem, ...existing.filter((i) => i.id !== newItem.id)];

  if (!cloudPreviewLoaded[uidStr] && isOnline() && isFirebaseConfigured && uidStr) {
    memoryPreviewQueue[uidStr] = updated;
    get(ref(rtdb, `previewQueues/${uidStr}`))
      .then((snap) => {
        let remoteItems: PreviewQueueItem[] = [];
        if (snap.exists()) {
          const val = snap.val();
          if (typeof val?.data === "string") {
            remoteItems = normalizeQueueItems(JSON.parse(val.data));
          }
        }
        const seenIds = new Set(updated.map((i) => i.id));
        const merged = [
          ...updated,
          ...remoteItems.filter((r) => !seenIds.has(r.id)),
        ];
        cloudPreviewLoaded[uidStr] = true;
        savePreviewQueue(uidStr, merged);
      })
      .catch(() => {
        savePreviewQueue(uidStr, updated);
      });
  } else {
    savePreviewQueue(uidStr, updated);
  }
  if (params.jobDescription?.trim() || params.roleName?.trim()) {
    logAppliedJobToFirebase(
      resolvedTitle,
      params.roleUrl || "",
      "queued",
      params.baseResume?.contact?.email || undefined,
      uidStr,
      params.jobDescription
    );
  }
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
      | "baseResume"
      | "larpRun"
      | "acceptedBulletIds"
      | "acceptedMalleableIds"
      | "selectedMalleableOptionBySlotId"
      | "applySkillsSwap"
      | "selectedSkillNames"
      | "customSkillCategoryByName"
      | "pushedToAgentsAt"
    >
  >,
  currentQueue?: PreviewQueueItem[]
): PreviewQueueItem[] {
  const existing = currentQueue ?? getCachedPreviewQueue(uidStr);
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

export function deletePreviewQueueItem(
  uidStr: string,
  itemId: string,
  currentQueue?: PreviewQueueItem[]
): PreviewQueueItem[] {
  const existing = currentQueue ?? getCachedPreviewQueue(uidStr);
  const updated = existing.filter((item) => item.id !== itemId);
  savePreviewQueue(uidStr, updated);
  return updated;
}

export interface RecoverablePreviewJob {
  id: string;
  jobTitle: string;
  jobUrl: string;
  jobDescription: string;
  timestamp: string;
}

const LAKSHMAN_OWNER_UIDS = new Set([
  "PvKPmKmpqSZMTW9w4XVqWK3Y8El1",
  "CtF9N7qVfcQse3DsZcPvkQ4dwCT2",
]);

const LAKSHMAN_OWNER_EMAILS = new Set([
  "lakshman.r.2008@gmail.com",
  "lakshmananramanathan08@gmail.com",
  "lakshmananramanthan08@gmail.com",
  "l2ramanathan@uwaterloo.ca",
]);

function normalizeRecoveryUrl(u?: string): string {
  return u ? u.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").trim() : "";
}

function normalizeRecoveryTitle(t?: string): string {
  return t ? t.toLowerCase().replace(/[^a-z0-9]/g, "").trim() : "";
}

/**
 * Scans the append-only `appliedJobs` log in Firebase RTDB to find previously queued
 * jobs belonging to the current user that are missing from `previewQueues` and not
 * already in `agentsQueues` or marked `"applied"`.
 */
export async function findRecoverablePreviewJobsFromCloud(
  uidStr: string,
  userEmail: string | null | undefined,
  currentPreviewQueue: PreviewQueueItem[],
  currentAgentsQueue: Array<{ roleName?: string; roleUrl?: string }>
): Promise<RecoverablePreviewJob[]> {
  if (!isFirebaseConfigured || !rtdb || !uidStr) return [];
  try {
    const snap = await get(ref(rtdb, "appliedJobs"));
    if (!snap.exists()) return [];
    const val = snap.val();
    if (!val || typeof val !== "object") return [];

    const emailLower = (userEmail || "").toLowerCase().trim();
    const isLakshman =
      isLakshmanAccount(uidStr) ||
      LAKSHMAN_OWNER_UIDS.has(uidStr) ||
      LAKSHMAN_OWNER_EMAILS.has(emailLower);

    const existingUrls = new Set<string>();
    const existingTitles = new Set<string>();

    for (const p of currentPreviewQueue) {
      const nu = normalizeRecoveryUrl(p.roleUrl);
      const nt = normalizeRecoveryTitle(p.roleName || p.title);
      if (nu) existingUrls.add(nu);
      if (nt) existingTitles.add(nt);
    }
    for (const a of currentAgentsQueue) {
      const nu = normalizeRecoveryUrl(a.roleUrl);
      const nt = normalizeRecoveryTitle(a.roleName);
      if (nu) existingUrls.add(nu);
      if (nt) existingTitles.add(nt);
    }

    const appliedUrls = new Set<string>();
    const appliedTitles = new Set<string>();
    const ownEntries: Array<{
      id: string;
      jobTitle: string;
      jobUrl: string;
      jobDescription: string;
      status: string;
      timestamp: string;
    }> = [];

    for (const [key, raw] of Object.entries(val)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const itemUid = typeof item.userId === "string" ? item.userId.trim() : "";
      const itemEmail =
        typeof item.userEmail === "string" ? item.userEmail.toLowerCase().trim() : "";

      const belongsToUser =
        itemUid === uidStr ||
        (emailLower.length > 0 && itemEmail === emailLower) ||
        (isLakshman &&
          (LAKSHMAN_OWNER_UIDS.has(itemUid) ||
            LAKSHMAN_OWNER_EMAILS.has(itemEmail) ||
            itemEmail.includes("lakshman") ||
            itemEmail.includes("ramanathan")));

      if (!belongsToUser) continue;

      const jobTitle =
        (typeof item.jobTitle === "string" && item.jobTitle.trim()) ||
        (typeof item.roleName === "string" && item.roleName.trim()) ||
        "";
      if (!jobTitle) continue;

      const jobUrl =
        (typeof item.jobUrl === "string" && item.jobUrl.trim()) ||
        (typeof item.roleUrl === "string" && item.roleUrl.trim()) ||
        "";
      const jobDescription =
        typeof item.jobDescription === "string" ? item.jobDescription.trim() : "";
      const status = typeof item.status === "string" ? item.status : "queued";
      const timestamp =
        typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString();

      if (status === "applied") {
        const nu = normalizeRecoveryUrl(jobUrl);
        const nt = normalizeRecoveryTitle(jobTitle);
        if (nu) appliedUrls.add(nu);
        if (nt) appliedTitles.add(nt);
        continue;
      }

      ownEntries.push({
        id: key,
        jobTitle,
        jobUrl,
        jobDescription,
        status,
        timestamp,
      });
    }

    // Deduplicate queued entries by normalized URL or title, keeping richest JD & latest timestamp
    const dedupMap = new Map<string, RecoverablePreviewJob>();
    for (const entry of ownEntries) {
      const nu = normalizeRecoveryUrl(entry.jobUrl);
      const nt = normalizeRecoveryTitle(entry.jobTitle);
      if ((nu && existingUrls.has(nu)) || (nt && existingTitles.has(nt))) continue;
      if ((nu && appliedUrls.has(nu)) || (nt && appliedTitles.has(nt))) continue;

      const dedupKey = nu || nt;
      if (!dedupKey) continue;

      const prev = dedupMap.get(dedupKey);
      if (!prev) {
        dedupMap.set(dedupKey, {
          id: entry.id,
          jobTitle: entry.jobTitle,
          jobUrl: entry.jobUrl,
          jobDescription: entry.jobDescription,
          timestamp: entry.timestamp,
        });
      } else {
        const prevTime = new Date(prev.timestamp).getTime() || 0;
        const currTime = new Date(entry.timestamp).getTime() || 0;
        dedupMap.set(dedupKey, {
          id: currTime >= prevTime ? entry.id : prev.id,
          jobTitle: entry.jobTitle.length > prev.jobTitle.length ? entry.jobTitle : prev.jobTitle,
          jobUrl: entry.jobUrl || prev.jobUrl,
          jobDescription:
            entry.jobDescription.length > prev.jobDescription.length
              ? entry.jobDescription
              : prev.jobDescription,
          timestamp: currTime >= prevTime ? entry.timestamp : prev.timestamp,
        });
      }
    }

    return Array.from(dedupMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (e) {
    console.warn("Could not scan appliedJobs for recoverable preview slots:", e);
    return [];
  }
}

/**
 * Rebuilds PreviewQueueItems from recovered `appliedJobs` records using the user's
 * active Master Resume and merges them into `previewQueues/${uidStr}` without
 * touching any currently queued items.
 */
export function restoreRecoverablePreviewJobs(
  uidStr: string,
  jobsToRestore: RecoverablePreviewJob[],
  baseResume: MasterResume,
  currentPreviewQueue: PreviewQueueItem[]
): PreviewQueueItem[] {
  if (!uidStr || jobsToRestore.length === 0) return currentPreviewQueue;

  const defaultPicksMap = buildCompanyDefaultPicksMap(baseResume, uidStr);
  const restoredItems: PreviewQueueItem[] = jobsToRestore.map((job) => {
    const effectiveJd = job.jobDescription || job.jobTitle;
    const alignment = runLarpAlignmentPipeline(effectiveJd, baseResume, {
      jdId: job.jobTitle || job.id,
      mode: "framing",
      focusedRecommendations: true,
      defaultPicksByCompanyKey: defaultPicksMap,
    });

    const initialOptMap: Record<string, string> = {};
    for (const mb of alignment.malleableBullets) {
      if (mb.options && mb.options.length > 0) {
        initialOptMap[mb.id] = mb.options[0].id;
      }
    }

    return {
      id: uid("pv"),
      roleName: job.jobTitle,
      roleUrl: job.jobUrl,
      title: job.jobTitle,
      createdAt: job.timestamp || new Date().toISOString(),
      jobDescription: effectiveJd,
      baseResume: structuredClone(baseResume),
      larpRun: alignment,
      acceptedBulletIds: alignment.bulletProposals.map((p) => p.bulletId),
      acceptedMalleableIds: alignment.malleableBullets
        .filter((m) => m.recommended)
        .map((m) => m.id),
      selectedMalleableOptionBySlotId: initialOptMap,
      applySkillsSwap: true,
      selectedSkillNames: alignment.skillSwaps.flatMap((s) => s.added),
      customSkillCategoryByName: {},
    };
  });

  const merged = [...currentPreviewQueue, ...restoredItems];
  cloudPreviewLoaded[uidStr] = true;
  savePreviewQueue(uidStr, merged);
  return merged;
}
