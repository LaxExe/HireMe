import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, onValue, set, get } from "firebase/database";
import { isOnline } from "@/lib/offlineSync";

export interface CandidateAppliedJob {
  id: string;
  jobTitle: string;
  jobUrl: string;
  timestamp: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  source: "appliedJobs" | "agentsQueue" | "syncedStore" | "manual";
}

export interface SecretJobsStoreData {
  jobs: CandidateAppliedJob[];
  archivedKeys: string[];
  updatedAt: string;
}

const LOCAL_STORE_KEY = (uid: string) => `hireme_secret_jobs_store_${uid}`;

function normalizeJobKey(title?: string, url?: string): string {
  const normTitle = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const normUrl = (url || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .trim();
  return `${normTitle}|${normUrl}`;
}

export function getJobIdentifier(job: { jobTitle: string; jobUrl: string }): string {
  return normalizeJobKey(job.jobTitle, job.jobUrl);
}

/**
 * Loads cached store from localStorage for instant 0ms rendering
 */
export function loadLocalSecretJobsStore(uid: string): SecretJobsStoreData {
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
    console.warn("Could not read local secret jobs store:", e);
  }
  return { jobs: [], archivedKeys: [], updatedAt: "" };
}

/**
 * Saves store to localStorage
 */
export function saveLocalSecretJobsStore(uid: string, data: SecretJobsStoreData): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    localStorage.setItem(LOCAL_STORE_KEY(uid), JSON.stringify(data));
  } catch (e) {
    console.warn("Could not save local secret jobs store:", e);
  }
}

/**
 * Subscribes to live changes in Firebase Realtime Database under previewQueues/${uid}/secretJobsStore.
 * Changes made on one computer instantly update all other open computers via WebSocket/onValue.
 */
export function subscribeSecretJobsStore(
  uid: string,
  callback: (data: SecretJobsStoreData) => void
): () => void {
  if (typeof window === "undefined" || !uid) return () => {};

  // Instant local cache paint
  const local = loadLocalSecretJobsStore(uid);
  callback(local);

  if (!isFirebaseConfigured || !rtdb) {
    return () => {};
  }

  try {
    const storeRef = ref(rtdb, `previewQueues/${uid}/secretJobsStore`);
    const unsubscribe = onValue(
      storeRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          let jobsList: CandidateAppliedJob[] = [];
          if (Array.isArray(val.jobs)) {
            jobsList = val.jobs;
          } else if (typeof val.jobs === "string") {
            try {
              jobsList = JSON.parse(val.jobs);
            } catch {}
          } else if (val.jobs && typeof val.jobs === "object") {
            jobsList = Object.values(val.jobs);
          }

          let archived: string[] = [];
          if (Array.isArray(val.archivedKeys)) {
            archived = val.archivedKeys;
          } else if (typeof val.archivedKeys === "string") {
            try {
              archived = JSON.parse(val.archivedKeys);
            } catch {}
          }

          const remoteData: SecretJobsStoreData = {
            jobs: jobsList,
            archivedKeys: archived,
            updatedAt: val.updatedAt || new Date().toISOString(),
          };

          // Update local cache
          saveLocalSecretJobsStore(uid, remoteData);
          callback(remoteData);
        } else {
          // If remote doesn't exist yet but we have local data, initialize remote
          const currentLocal = loadLocalSecretJobsStore(uid);
          if (currentLocal.jobs.length > 0 || currentLocal.archivedKeys.length > 0) {
            saveSecretJobsStoreToCloud(uid, currentLocal);
          }
        }
      },
      (error) => {
        console.warn("RTDB secret jobs store listener warning:", error.message);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn("Error attaching RTDB secret jobs store listener:", e);
    return () => {};
  }
}

/**
 * Persists store to Firebase Realtime Database under previewQueues/${uid}/secretJobsStore.
 */
export async function saveSecretJobsStoreToCloud(
  uid: string,
  data: SecretJobsStoreData
): Promise<void> {
  saveLocalSecretJobsStore(uid, data);

  if (typeof window !== "undefined" && !isOnline()) {
    return;
  }

  if (isFirebaseConfigured && rtdb && uid) {
    try {
      const storeRef = ref(rtdb, `previewQueues/${uid}/secretJobsStore`);
      await set(storeRef, {
        jobs: JSON.stringify(data.jobs),
        archivedKeys: data.archivedKeys,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Could not save secret jobs store to RTDB:", e);
    }
  }
}

/**
 * Merges a list of jobs into the persistent store and writes to Firebase Realtime Database.
 */
export async function mergeJobsIntoStore(
  uid: string,
  newJobs: CandidateAppliedJob[]
): Promise<SecretJobsStoreData> {
  const current = loadLocalSecretJobsStore(uid);
  const existingMap = new Map<string, CandidateAppliedJob>();

  for (const job of current.jobs) {
    const key = normalizeJobKey(job.jobTitle, job.jobUrl);
    existingMap.set(key, job);
  }

  let hasNew = false;
  for (const job of newJobs) {
    const key = normalizeJobKey(job.jobTitle, job.jobUrl);
    if (!existingMap.has(key)) {
      existingMap.set(key, job);
      hasNew = true;
    }
  }

  if (!hasNew) {
    return current;
  }

  const mergedList = Array.from(existingMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const updatedStore: SecretJobsStoreData = {
    jobs: mergedList,
    archivedKeys: current.archivedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveSecretJobsStoreToCloud(uid, updatedStore);
  return updatedStore;
}

/**
 * Archives a job in the database so it is archived across all computers.
 */
export async function archiveJobInCloud(
  uid: string,
  job: CandidateAppliedJob
): Promise<SecretJobsStoreData> {
  const current = loadLocalSecretJobsStore(uid);
  const key = normalizeJobKey(job.jobTitle, job.jobUrl);
  const updatedKeys = Array.from(new Set([...current.archivedKeys, job.id, key]));

  const updatedStore: SecretJobsStoreData = {
    ...current,
    archivedKeys: updatedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveSecretJobsStoreToCloud(uid, updatedStore);
  return updatedStore;
}

/**
 * Restores/unarchives a job in the database across all computers.
 */
export async function unarchiveJobInCloud(
  uid: string,
  job: CandidateAppliedJob
): Promise<SecretJobsStoreData> {
  const current = loadLocalSecretJobsStore(uid);
  const key = normalizeJobKey(job.jobTitle, job.jobUrl);
  const updatedKeys = current.archivedKeys.filter((k) => k !== job.id && k !== key);

  const updatedStore: SecretJobsStoreData = {
    ...current,
    archivedKeys: updatedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveSecretJobsStoreToCloud(uid, updatedStore);
  return updatedStore;
}

/**
 * Restores all archived jobs in the database across all computers.
 */
export async function restoreAllArchivedInCloud(uid: string): Promise<SecretJobsStoreData> {
  const current = loadLocalSecretJobsStore(uid);
  const updatedStore: SecretJobsStoreData = {
    ...current,
    archivedKeys: [],
    updatedAt: new Date().toISOString(),
  };

  await saveSecretJobsStoreToCloud(uid, updatedStore);
  return updatedStore;
}
