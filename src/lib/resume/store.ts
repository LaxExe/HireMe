import { db, isFirebaseConfigured } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
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

/** Loads from Firestore when configured, falling back to the local database. */
export async function loadMasterResume(uid: string): Promise<MasterResume | null> {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDoc(doc(db, "masterResumes", uid));
      if (snap.exists()) {
        const data = snap.data().data;
        if (typeof data === "string") {
          const parsed = JSON.parse(data) as MasterResume;
          if (!parsed.awards) parsed.awards = [];
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Firestore master resume read failed, using local DB:", e);
    }
  }
  return readLocal(uid);
}

/** Always writes locally, and mirrors to Firestore when configured. */
export async function saveMasterResume(uid: string, resume: MasterResume): Promise<void> {
  const payload = JSON.stringify(resume);
  if (typeof window !== "undefined") {
    localStorage.setItem(localKey(uid), payload);
  }
  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, "masterResumes", uid), {
        data: payload,
        updatedAt: resume.updatedAt,
      });
    } catch (e) {
      console.warn("Firestore master resume write failed, kept local copy:", e);
    }
  }
}
