import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, update, onValue } from "firebase/database";
import { isOnline, enqueueOfflineItem } from "@/lib/offlineSync";
import { applyLakshmanHeaderToResume, isLakshmanAccount } from "./headerMigration";
import type { MasterResume } from "./types";

export interface MasterResumeCollection {
  resumes: MasterResume[];
  activeResumeId: string;
}

const localKey = (uid: string) => `hireme_master_resume_${uid}`;
const localCollectionKey = (uid: string) => `hireme_master_resumes_collection_${uid}`;

export function ensureResumeMeta(resume: MasterResume, index: number): MasterResume {
  const next = { ...resume };
  if (!next.awards) next.awards = [];
  if (!next.id || !next.id.trim()) {
    next.id = index === 0 ? "master-1" : `master-${index + 1}`;
  }
  if (!next.name || !next.name.trim()) {
    next.name = index === 0 ? "Master Resume 1" : `Master Resume ${index + 1}`;
  }
  return next;
}

function normalizeResumeList(
  uid: string,
  rawList: MasterResume[]
): { resumes: MasterResume[]; changed: boolean } {
  let changed = false;
  const isLakshman = isLakshmanAccount(uid);
  const seenIds = new Set<string>();

  const resumes = rawList.map((item, idx) => {
    let curr = ensureResumeMeta(item, idx);
    if (seenIds.has(curr.id!)) {
      curr = { ...curr, id: `master-${idx + 1}-${Date.now().toString(36)}` };
      changed = true;
    }
    seenIds.add(curr.id!);

    if (curr.id !== item.id || curr.name !== item.name) {
      changed = true;
    }

    if (isLakshman) {
      const migrated = applyLakshmanHeaderToResume(curr);
      if (migrated.changed) {
        curr = {
          ...migrated.resume,
          id: curr.id,
          name: curr.name,
        };
        changed = true;
      }
    }
    return curr;
  });

  return { resumes, changed };
}

function writeLocalCollectionCache(uid: string, collection: MasterResumeCollection): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    localStorage.setItem(localCollectionKey(uid), JSON.stringify(collection));
    const active =
      collection.resumes.find((r) => r.id === collection.activeResumeId) ||
      collection.resumes[0] ||
      null;
    if (active) {
      localStorage.setItem(localKey(uid), JSON.stringify(active));
    } else {
      localStorage.removeItem(localKey(uid));
    }
  } catch (e) {
    console.warn("Could not write master resume collection to localStorage:", e);
  }
}

export function readLocalCollection(uid: string): MasterResumeCollection {
  if (typeof window === "undefined" || !uid) {
    return { resumes: [], activeResumeId: "" };
  }

  try {
    const rawCol = localStorage.getItem(localCollectionKey(uid));
    if (rawCol) {
      const parsedCol = JSON.parse(rawCol) as Partial<MasterResumeCollection>;
      if (Array.isArray(parsedCol?.resumes) && parsedCol.resumes.length > 0) {
        const { resumes, changed } = normalizeResumeList(uid, parsedCol.resumes);
        const activeResumeId =
          parsedCol.activeResumeId && resumes.some((r) => r.id === parsedCol.activeResumeId)
            ? parsedCol.activeResumeId
            : resumes[0]?.id || "";
        const result: MasterResumeCollection = { resumes, activeResumeId };
        if (changed || activeResumeId !== parsedCol.activeResumeId) {
          writeLocalCollectionCache(uid, result);
        }
        return result;
      }
    }
  } catch {}

  try {
    const rawSingle = localStorage.getItem(localKey(uid));
    if (rawSingle) {
      const parsedSingle = JSON.parse(rawSingle) as MasterResume;
      if (parsedSingle && typeof parsedSingle === "object") {
        const { resumes } = normalizeResumeList(uid, [parsedSingle]);
        const result: MasterResumeCollection = {
          resumes,
          activeResumeId: resumes[0]?.id || "master-1",
        };
        writeLocalCollectionCache(uid, result);
        return result;
      }
    }
  } catch {}

  return { resumes: [], activeResumeId: "" };
}

function parseSnapshotToCollection(
  uid: string,
  val: Record<string, unknown> | null | undefined
): { collection: MasterResumeCollection; needsCloudUpgrade: boolean } | null {
  if (!val || typeof val !== "object") return null;

  const rawResumesData = val.resumesData;
  const rawSingleData = val.data;
  const rawActiveId = typeof val.activeResumeId === "string" ? val.activeResumeId : "";

  if (typeof rawResumesData === "string") {
    try {
      const parsedList = JSON.parse(rawResumesData) as MasterResume[];
      if (Array.isArray(parsedList) && parsedList.length > 0) {
        const { resumes, changed } = normalizeResumeList(uid, parsedList);
        const activeResumeId =
          rawActiveId && resumes.some((r) => r.id === rawActiveId)
            ? rawActiveId
            : resumes[0]?.id || "";
        return {
          collection: { resumes, activeResumeId },
          needsCloudUpgrade: changed,
        };
      }
    } catch {}
  }

  if (typeof rawSingleData === "string") {
    try {
      const parsedSingle = JSON.parse(rawSingleData) as MasterResume;
      if (parsedSingle && typeof parsedSingle === "object") {
        const local = readLocalCollection(uid);
        const { resumes: normalizedSingleList } = normalizeResumeList(uid, [parsedSingle]);
        const singleResume = normalizedSingleList[0];

        if (local.resumes.length > 1) {
          const existsInLocal = local.resumes.some((r) => r.id === singleResume.id);
          const mergedResumes = existsInLocal
            ? local.resumes.map((r) => (r.id === singleResume.id ? singleResume : r))
            : [singleResume, ...local.resumes];
          const activeResumeId =
            local.activeResumeId && mergedResumes.some((r) => r.id === local.activeResumeId)
              ? local.activeResumeId
              : mergedResumes[0].id!;
          return {
            collection: { resumes: mergedResumes, activeResumeId },
            needsCloudUpgrade: true,
          };
        }

        return {
          collection: {
            resumes: [singleResume],
            activeResumeId: singleResume.id || "master-1",
          },
          needsCloudUpgrade: true,
        };
      }
    } catch {}
  }

  return null;
}

export function getMasterResumeById(
  collection: MasterResumeCollection,
  resumeId?: string | null
): MasterResume | null {
  if (!collection || collection.resumes.length === 0) return null;
  if (resumeId) {
    const found = collection.resumes.find((r) => r.id === resumeId);
    if (found) return found;
  }
  if (collection.activeResumeId) {
    const active = collection.resumes.find((r) => r.id === collection.activeResumeId);
    if (active) return active;
  }
  return collection.resumes[0] || null;
}

/** Loads all master resumes from Realtime Database when configured, falling back to local storage. */
export async function loadMasterResumes(uid: string): Promise<MasterResumeCollection> {
  if (isFirebaseConfigured && uid) {
    try {
      const snap = await get(ref(rtdb, `masterResumes/${uid}`));
      if (snap.exists()) {
        const parsed = parseSnapshotToCollection(uid, snap.val());
        if (parsed) {
          writeLocalCollectionCache(uid, parsed.collection);
          if (parsed.needsCloudUpgrade) {
            await saveMasterResumes(uid, parsed.collection);
          }
          return parsed.collection;
        }
      }
    } catch (e) {
      console.warn("RTDB master resumes read failed, using local DB:", e);
    }
  }
  return readLocalCollection(uid);
}

/**
 * Subscribes to live real-time updates from Firebase Realtime Database for all of the user's master resumes.
 * Immediately yields local cache, then streams live cloud changes across devices.
 */
export function subscribeMasterResumes(
  uid: string,
  callback: (collection: MasterResumeCollection) => void
): () => void {
  if (typeof window === "undefined" || !uid) return () => {};

  const local = readLocalCollection(uid);
  if (local.resumes.length > 0) {
    callback(local);
  }

  if (isFirebaseConfigured && uid) {
    try {
      const resumeRef = ref(rtdb, `masterResumes/${uid}`);
      const unsubscribe = onValue(
        resumeRef,
        (snap) => {
          if (snap.exists()) {
            const parsed = parseSnapshotToCollection(uid, snap.val());
            if (parsed) {
              writeLocalCollectionCache(uid, parsed.collection);
              if (parsed.needsCloudUpgrade) {
                void saveMasterResumes(uid, parsed.collection);
              }
              callback(parsed.collection);
              return;
            }
          }

          const currentLocal = readLocalCollection(uid);
          if (currentLocal.resumes.length > 0) {
            void saveMasterResumes(uid, currentLocal);
            callback(currentLocal);
          } else {
            callback({ resumes: [], activeResumeId: "" });
          }
        },
        (err) => {
          console.warn("Live RTDB master resumes sync warning:", err);
        }
      );
      return unsubscribe;
    } catch (e) {
      console.warn("Could not attach RTDB master resumes listener:", e);
    }
  }

  return () => {};
}

/** Saves the entire master resume collection locally and mirrors to Realtime Database with offline queue fallback. */
export async function saveMasterResumes(
  uid: string,
  collection: MasterResumeCollection
): Promise<void> {
  const { resumes } = normalizeResumeList(uid, collection.resumes);
  const activeResumeId =
    collection.activeResumeId && resumes.some((r) => r.id === collection.activeResumeId)
      ? collection.activeResumeId
      : resumes[0]?.id || "";

  const normalizedCollection: MasterResumeCollection = {
    resumes,
    activeResumeId,
  };

  writeLocalCollectionCache(uid, normalizedCollection);

  const activeResume =
    resumes.find((r) => r.id === activeResumeId) || resumes[0] || null;
  const singlePayload = activeResume ? JSON.stringify(activeResume) : "";
  const listPayload = JSON.stringify(resumes);
  const now = activeResume?.updatedAt || new Date().toISOString();

  if (isOnline() && isFirebaseConfigured && uid) {
    try {
      await update(ref(rtdb, `masterResumes/${uid}`), {
        data: singlePayload,
        resumesData: listPayload,
        activeResumeId,
        updatedAt: now,
      });
    } catch (e) {
      console.warn("RTDB master resumes write failed, queueing offline:", e);
      enqueueOfflineItem({
        type: "masterResume",
        uid,
        data: singlePayload,
        resumesData: listPayload,
        activeResumeId,
        timestamp: now,
      });
    }
  } else if (uid) {
    enqueueOfflineItem({
      type: "masterResume",
      uid,
      data: singlePayload,
      resumesData: listPayload,
      activeResumeId,
      timestamp: now,
    });
  }
}

/** Loads a single master resume (by optional resumeId, or the active resume). */
export async function loadMasterResume(
  uid: string,
  resumeId?: string
): Promise<MasterResume | null> {
  const collection = await loadMasterResumes(uid);
  return getMasterResumeById(collection, resumeId);
}

/** Subscribes to the user's active master resume. */
export function subscribeMasterResume(
  uid: string,
  callback: (resume: MasterResume | null) => void
): () => void {
  return subscribeMasterResumes(uid, (collection) => {
    callback(getMasterResumeById(collection, collection.activeResumeId));
  });
}

/** Updates or saves a single master resume inside the user's collection without losing other resumes. */
export async function saveMasterResume(uid: string, resume: MasterResume): Promise<void> {
  const current = readLocalCollection(uid);
  if (current.resumes.length === 0) {
    const initialized = ensureResumeMeta(resume, 0);
    await saveMasterResumes(uid, {
      resumes: [initialized],
      activeResumeId: initialized.id!,
    });
    return;
  }

  const targetId = resume.id || current.activeResumeId || current.resumes[0].id!;
  const existingIdx = current.resumes.findIndex((r) => r.id === targetId);

  let nextResumes: MasterResume[];
  if (existingIdx >= 0) {
    const existing = current.resumes[existingIdx];
    const merged: MasterResume = {
      ...resume,
      id: existing.id,
      name: resume.name?.trim() || existing.name || `Master Resume ${existingIdx + 1}`,
    };
    nextResumes = current.resumes.map((r, i) => (i === existingIdx ? merged : r));
  } else {
    const initialized = ensureResumeMeta(
      { ...resume, id: targetId },
      current.resumes.length
    );
    nextResumes = [...current.resumes, initialized];
  }

  await saveMasterResumes(uid, {
    resumes: nextResumes,
    activeResumeId: targetId,
  });
}
