import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, set, onValue } from "firebase/database";
import { isOnline, enqueueOfflineItem } from "@/lib/offlineSync";
import type { MasterResume } from "./types";

const localKey = (uid: string) => `hireme_master_resume_${uid}`;

function readLocal(uid: string): MasterResume | null {
  if (typeof window === "undefined" || !uid) return null;
  try {
    const raw = localStorage.getItem(localKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MasterResume;
    if (!parsed.awards) parsed.awards = [];
    return parsed;
  } catch {
    return null;
  }
}

/** Loads from Realtime Database when configured, falling back to local storage. */
export async function loadMasterResume(uid: string): Promise<MasterResume | null> {
  if (isFirebaseConfigured && uid) {
    try {
      const snap = await get(ref(rtdb, `masterResumes/${uid}`));
      if (snap.exists()) {
        const val = snap.val();
        const data = val?.data;
        if (typeof data === "string") {
          const parsed = JSON.parse(data) as MasterResume;
          if (!parsed.awards) parsed.awards = [];
          if (typeof window !== "undefined") {
            localStorage.setItem(localKey(uid), data);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn("RTDB master resume read failed, using local DB:", e);
    }
  }
  return readLocal(uid);
}

/**
 * Subscribes to live real-time updates from Firebase Realtime Database for the user's master resume.
 * Immediately yields local cache, then streams live cloud changes across devices.
 */
export function subscribeMasterResume(
  uid: string,
  callback: (resume: MasterResume | null) => void
): () => void {
  if (typeof window === "undefined" || !uid) return () => {};

  // Instant local cache paint for zero-flicker UI
  const local = readLocal(uid);
  if (local) {
    callback(local);
  }

  if (isFirebaseConfigured && uid) {
    try {
      const resumeRef = ref(rtdb, `masterResumes/${uid}`);
      const unsubscribe = onValue(
        resumeRef,
        (snap) => {
          if (snap.exists()) {
            const val = snap.val();
            const data = val?.data;
            if (typeof data === "string") {
              const parsed = JSON.parse(data) as MasterResume;
              if (!parsed.awards) parsed.awards = [];
              if (typeof window !== "undefined") {
                localStorage.setItem(localKey(uid), data);
              }
              callback(parsed);
              return;
            }
          }
          if (!snap.exists()) {
            const currentLocal = readLocal(uid);
            if (!currentLocal) {
              callback(null);
            }
          }
        },
        (err) => {
          console.warn("Live RTDB master resume sync warning:", err);
        }
      );
      return unsubscribe;
    } catch (e) {
      console.warn("Could not attach RTDB master resume listener:", e);
    }
  }

  return () => {};
}

/** Always writes locally, and mirrors to Realtime Database with offline queue fallback. */
export async function saveMasterResume(uid: string, resume: MasterResume): Promise<void> {
  const payload = JSON.stringify(resume);
  const now = resume.updatedAt || new Date().toISOString();

  if (typeof window !== "undefined" && uid) {
    localStorage.setItem(localKey(uid), payload);
  }

  if (isOnline() && isFirebaseConfigured && uid) {
    try {
      await set(ref(rtdb, `masterResumes/${uid}`), {
        data: payload,
        updatedAt: now,
      });
    } catch (e) {
      console.warn("RTDB master resume write failed, queueing offline:", e);
      enqueueOfflineItem({
        type: "masterResume",
        uid,
        data: payload,
        timestamp: now,
      });
    }
  } else if (uid) {
    enqueueOfflineItem({
      type: "masterResume",
      uid,
      data: payload,
      timestamp: now,
    });
  }
}
