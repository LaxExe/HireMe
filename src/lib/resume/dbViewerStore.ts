import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, onValue, set, get } from "firebase/database";
import { isOnline } from "@/lib/offlineSync";

export interface DbViewerRecord {
  id: string;
  jobTitle: string;
  jobUrl: string;
  timestamp: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  source: "appliedJobs" | "agentsQueue" | "syncedStore" | "manual";
}

export interface DbViewerStoreData {
  jobs: DbViewerRecord[];
  archivedKeys: string[];
  updatedAt: string;
}

const LOCAL_STORE_KEY = (uid: string) => `hireme_db_viewer_store_${uid}`;
const cloudDbStoreLoaded: Record<string, boolean> = {};

function parseRemoteDbStore(val: Record<string, any> | null | undefined): DbViewerStoreData {
  if (!val || typeof val !== "object") {
    return { jobs: [], archivedKeys: [], updatedAt: "" };
  }
  const sourceNode =
    val.dbViewerStore && typeof val.dbViewerStore === "object"
      ? val.dbViewerStore
      : Object.values(val).find(
          (v: any) =>
            v &&
            typeof v === "object" &&
            (v.jobs !== undefined || v.archivedKeys !== undefined)
        ) || val;
  let jobsList: DbViewerRecord[] = [];
  if (Array.isArray(sourceNode.jobs)) {
    jobsList = sourceNode.jobs;
  } else if (typeof sourceNode.jobs === "string") {
    try {
      jobsList = JSON.parse(sourceNode.jobs);
    } catch {}
  } else if (sourceNode.jobs && typeof sourceNode.jobs === "object") {
    jobsList = Object.values(sourceNode.jobs);
  }

  let archived: string[] = [];
  if (Array.isArray(sourceNode.archivedKeys)) {
    archived = sourceNode.archivedKeys;
  } else if (typeof sourceNode.archivedKeys === "string") {
    try {
      archived = JSON.parse(sourceNode.archivedKeys);
    } catch {}
  }

  return {
    jobs: jobsList,
    archivedKeys: archived,
    updatedAt: sourceNode.updatedAt || new Date().toISOString(),
  };
}

async function ensureHydratedDbViewerStore(uid: string): Promise<DbViewerStoreData> {
  const local = loadLocalDbViewerStore(uid);
  if (cloudDbStoreLoaded[uid] || !isFirebaseConfigured || !rtdb || !uid) {
    return local;
  }
  try {
    const snap = await get(ref(rtdb, `previewQueues/${uid}`));
    cloudDbStoreLoaded[uid] = true;
    if (snap.exists()) {
      const remote = parseRemoteDbStore(snap.val());
      const mergedArchived = Array.from(new Set([...remote.archivedKeys, ...local.archivedKeys]));
      const existingMap = new Map<string, DbViewerRecord>();
      for (const j of remote.jobs) {
        existingMap.set(normalizeRecordKey(j.jobTitle, j.jobUrl), j);
      }
      for (const j of local.jobs) {
        const k = normalizeRecordKey(j.jobTitle, j.jobUrl);
        if (!existingMap.has(k)) existingMap.set(k, j);
      }
      const hydrated: DbViewerStoreData = {
        jobs: Array.from(existingMap.values()),
        archivedKeys: mergedArchived,
        updatedAt: remote.updatedAt || local.updatedAt,
      };
      saveLocalDbViewerStore(uid, hydrated);
      return hydrated;
    }
  } catch (e) {
    console.warn("Could not hydrate DB viewer store from RTDB:", e);
  }
  return local;
}

function normalizeRecordKey(title?: string, url?: string): string {
  const normTitle = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const normUrl = (url || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .trim();
  return `${normTitle}|${normUrl}`;
}

export function getRecordIdentifier(record: { jobTitle: string; jobUrl: string }): string {
  return normalizeRecordKey(record.jobTitle, record.jobUrl);
}

/**
 * Loads cached store from localStorage for instant 0ms rendering
 */
export function loadLocalDbViewerStore(uid: string): DbViewerStoreData {
  if (typeof window === "undefined" || !uid) {
    return { jobs: [], archivedKeys: [], updatedAt: "" };
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORE_KEY(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        archivedKeys: Array.isArray(parsed.archivedKeys) ? parsed.archivedKeys : [],
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    }
  } catch (e) {
    console.warn("Could not read local DB viewer store:", e);
  }
  return { jobs: [], archivedKeys: [], updatedAt: "" };
}

/**
 * Saves store to localStorage
 */
export function saveLocalDbViewerStore(uid: string, data: DbViewerStoreData): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    localStorage.setItem(LOCAL_STORE_KEY(uid), JSON.stringify(data));
  } catch (e) {
    console.warn("Could not save local DB viewer store:", e);
  }
}

/**
 * Subscribes to live changes in Firebase Realtime Database under previewQueues/${uid}/dbViewerStore.
 * Changes made on one computer instantly update all other open computers via WebSocket/onValue.
 */
export function subscribeDbViewerStore(
  uid: string,
  callback: (data: DbViewerStoreData) => void
): () => void {
  if (typeof window === "undefined" || !uid) return () => {};

  // Instant local cache paint
  const local = loadLocalDbViewerStore(uid);
  callback(local);

  if (!isFirebaseConfigured || !rtdb) {
    return () => {};
  }

  try {
    const storeRef = ref(rtdb, `previewQueues/${uid}`);
    const unsubscribe = onValue(
      storeRef,
      (snap) => {
        if (snap.exists()) {
          cloudDbStoreLoaded[uid] = true;
          const val = snap.val();
          const remoteData = parseRemoteDbStore(val);
          if (!val?.dbViewerStore && (remoteData.jobs.length > 0 || remoteData.archivedKeys.length > 0)) {
            saveDbViewerStoreToCloud(uid, remoteData);
          }

          // Update local cache
          saveLocalDbViewerStore(uid, remoteData);
          callback(remoteData);
        } else {
          cloudDbStoreLoaded[uid] = true;
          // If remote doesn't exist yet but we have local data, initialize remote
          const currentLocal = loadLocalDbViewerStore(uid);
          if (currentLocal.jobs.length > 0 || currentLocal.archivedKeys.length > 0) {
            saveDbViewerStoreToCloud(uid, currentLocal);
          }
        }
      },
      (error) => {
        console.warn("RTDB viewer store listener warning:", error.message);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn("Error attaching RTDB viewer store listener:", e);
    return () => {};
  }
}

/**
 * Persists store to Firebase Realtime Database under previewQueues/${uid}/dbViewerStore.
 */
export async function saveDbViewerStoreToCloud(
  uid: string,
  data: DbViewerStoreData
): Promise<void> {
  saveLocalDbViewerStore(uid, data);

  if (typeof window !== "undefined" && !isOnline()) {
    return;
  }

  if (isFirebaseConfigured && rtdb && uid) {
    try {
      const storeRef = ref(rtdb, `previewQueues/${uid}/dbViewerStore`);
      await set(storeRef, {
        jobs: JSON.stringify(data.jobs),
        archivedKeys: data.archivedKeys,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Could not save DB viewer store to RTDB:", e);
    }
  }
}

/**
 * Merges a list of records into the persistent store and writes to Firebase Realtime Database.
 */
export async function mergeRecordsIntoStore(
  uid: string,
  newRecords: DbViewerRecord[]
): Promise<DbViewerStoreData> {
  const current = await ensureHydratedDbViewerStore(uid);
  const existingMap = new Map<string, DbViewerRecord>();

  for (const record of current.jobs) {
    const key = normalizeRecordKey(record.jobTitle, record.jobUrl);
    existingMap.set(key, record);
  }

  let hasNew = false;
  for (const record of newRecords) {
    const key = normalizeRecordKey(record.jobTitle, record.jobUrl);
    if (!existingMap.has(key)) {
      existingMap.set(key, record);
      hasNew = true;
    }
  }

  if (!hasNew) {
    return current;
  }

  const mergedList = Array.from(existingMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const updatedStore: DbViewerStoreData = {
    jobs: mergedList,
    archivedKeys: current.archivedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveDbViewerStoreToCloud(uid, updatedStore);
  return updatedStore;
}

/**
 * Archives a record in the database so it is archived across all computers.
 */
export async function archiveRecordInCloud(
  uid: string,
  record: DbViewerRecord
): Promise<DbViewerStoreData> {
  const current = await ensureHydratedDbViewerStore(uid);
  const key = normalizeRecordKey(record.jobTitle, record.jobUrl);
  const updatedKeys = Array.from(new Set([...current.archivedKeys, record.id, key]));

  const updatedStore: DbViewerStoreData = {
    ...current,
    archivedKeys: updatedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveDbViewerStoreToCloud(uid, updatedStore);
  return updatedStore;
}

/**
 * Restores/unarchives a record in the database across all computers.
 */
export async function unarchiveRecordInCloud(
  uid: string,
  record: DbViewerRecord
): Promise<DbViewerStoreData> {
  const current = loadLocalDbViewerStore(uid);
  const key = normalizeRecordKey(record.jobTitle, record.jobUrl);
  const updatedKeys = current.archivedKeys.filter((k) => k !== record.id && k !== key);

  const updatedStore: DbViewerStoreData = {
    ...current,
    archivedKeys: updatedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveDbViewerStoreToCloud(uid, updatedStore);
  return updatedStore;
}

/**
 * Restores all archived records in the database across all computers.
 */
export async function restoreAllArchivedInCloud(uid: string): Promise<DbViewerStoreData> {
  const current = loadLocalDbViewerStore(uid);
  const updatedStore: DbViewerStoreData = {
    ...current,
    archivedKeys: [],
    updatedAt: new Date().toISOString(),
  };

  await saveDbViewerStoreToCloud(uid, updatedStore);
  return updatedStore;
}
