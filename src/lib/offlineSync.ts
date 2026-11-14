import { rtdb, isFirebaseConfigured } from "./firebase";
import { ref, push, set } from "firebase/database";

export interface PendingAppliedJob {
  type: "appliedJob";
  jobTitle: string;
  jobUrl: string;
  status: "queued" | "applied";
  timestamp: string;
}

export interface PendingCandidate {
  type: "candidate";
  candidate: {
    id: string;
    name: string;
    email: string;
    roleTitle: string;
    stage: "Review" | "Interview" | "Offer" | "Hired";
    appliedDate: string;
  };
}

export interface PendingRole {
  type: "role";
  role: {
    id: string;
    title: string;
    department: string;
    location: string;
    type: string;
    status: "active" | "draft" | "closed";
    createdAt: string;
  };
}

export interface PendingAgentsQueue {
  type: "agentsQueue";
  uid: string;
  data: string;
  timestamp: string;
}

export interface PendingPreviewQueue {
  type: "previewQueue";
  uid: string;
  data: string;
  timestamp: string;
}

export interface PendingMasterResume {
  type: "masterResume";
  uid: string;
  data: string;
  timestamp: string;
}

export type PendingSyncItem =
  | PendingAppliedJob
  | PendingCandidate
  | PendingRole
  | PendingAgentsQueue
  | PendingPreviewQueue
  | PendingMasterResume;

const OFFLINE_QUEUE_KEY = "hireme_offline_sync_queue";

/**
 * Returns true if the device currently has active network / wifi connectivity.
 */
export function isOnline(): boolean {
  if (typeof window === "undefined") return true;
  return typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
    ? navigator.onLine
    : true;
}

/**
 * Reads any pending offline mutations waiting to be synced to Firebase.
 */
export function getOfflineQueue(): PendingSyncItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Queues an item in localStorage ONLY when offline or network write fails.
 */
export function enqueueOfflineItem(item: PendingSyncItem): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getOfflineQueue();
    queue.push(item);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Failed to store item in offline queue:", e);
  }
}

/**
 * Flushes all offline queued data up to Firebase Realtime Database and cleans up localStorage.
 */
export async function flushOfflineQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isOnline() || !isFirebaseConfigured) return;

  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const remaining: PendingSyncItem[] = [];

  for (const item of queue) {
    try {
      if (item.type === "appliedJob") {
        const jobRef = push(ref(rtdb, "appliedJobs"));
        await set(jobRef, {
          jobTitle: item.jobTitle,
          jobUrl: item.jobUrl,
          status: item.status,
          timestamp: item.timestamp,
        });
      } else if (item.type === "candidate") {
        await set(ref(rtdb, `candidates/${item.candidate.id}`), item.candidate);
      } else if (item.type === "role") {
        await set(ref(rtdb, `roles/${item.role.id}`), item.role);
      } else if (item.type === "agentsQueue") {
        await set(ref(rtdb, `agentsQueues/${item.uid}`), {
          data: item.data,
          updatedAt: item.timestamp,
        });
      } else if (item.type === "previewQueue") {
        await set(ref(rtdb, `previewQueues/${item.uid}`), {
          data: item.data,
          updatedAt: item.timestamp,
        });
      } else if (item.type === "masterResume") {
        await set(ref(rtdb, `masterResumes/${item.uid}`), {
          data: item.data,
          updatedAt: item.timestamp,
        });
      }
    } catch (e) {
      console.warn("Could not sync offline item to Firebase, will retry when network restores:", e);
      remaining.push(item);
    }
  }

  if (remaining.length > 0) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  }
}

/**
 * Initializes automatic sync when WiFi or network connection is restored.
 */
export function initOfflineSyncListener(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    flushOfflineQueue();
  };

  window.addEventListener("online", handleOnline);

  // Also check on window focus
  window.addEventListener("focus", handleOnline);

  // Initial flush check on startup
  if (isOnline()) {
    flushOfflineQueue();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("focus", handleOnline);
  };
}
