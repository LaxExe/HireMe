import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, set } from "firebase/database";
import type { MasterResume } from "./types";

const localKey = (uid: string) => `hireme_master_resume_${uid}`;

function readLocal(uid: string): MasterResume | null {
  if (typeof window === "undefined") return null;
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
          return parsed;
        }
      }
    } catch (e) {
      console.warn("RTDB master resume read failed, using local DB:", e);
    }
  }
  return readLocal(uid);
}

/** Always writes locally, and mirrors to Realtime Database when configured. */
export async function saveMasterResume(uid: string, resume: MasterResume): Promise<void> {
  const payload = JSON.stringify(resume);
  if (typeof window !== "undefined") {
    localStorage.setItem(localKey(uid), payload);
  }
  if (isFirebaseConfigured && uid) {
    try {
      await set(ref(rtdb, `masterResumes/${uid}`), {
        data: payload,
        updatedAt: resume.updatedAt,
      });
    } catch (e) {
      console.warn("RTDB master resume write failed, kept local copy:", e);
    }
  }
}
