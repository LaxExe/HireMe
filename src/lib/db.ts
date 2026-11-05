import { db, isFirebaseConfigured } from "./firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";

export interface Role {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  status: "active" | "draft" | "closed";
  createdAt: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  roleTitle: string;
  stage: "Review" | "Interview" | "Offer" | "Hired";
  appliedDate: string;
}

const DEFAULT_ROLES: Role[] = [
  {
    id: "role-1",
    title: "Senior Full Stack Engineer",
    department: "Engineering",
    location: "Remote / NYC",
    type: "Full-time",
    status: "active",
    createdAt: "2026-11-01",
  },
  {
    id: "role-2",
    title: "Staff Product Designer",
    department: "Design",
    location: "San Francisco, CA",
    type: "Full-time",
    status: "active",
    createdAt: "2026-11-03",
  },
  {
    id: "role-3",
    title: "Technical Recruiter",
    department: "Operations",
    location: "Remote",
    type: "Contract",
    status: "draft",
    createdAt: "2026-11-04",
  },
];

const DEFAULT_CANDIDATES: Candidate[] = [
  {
    id: "cand-1",
    name: "Alex Rivera",
    email: "alex.rivera@example.com",
    roleTitle: "Senior Full Stack Engineer",
    stage: "Interview",
    appliedDate: "2026-11-04",
  },
  {
    id: "cand-2",
    name: "Sophia Chen",
    email: "sophia.chen@example.com",
    roleTitle: "Staff Product Designer",
    stage: "Offer",
    appliedDate: "2026-11-02",
  },
  {
    id: "cand-3",
    name: "Marcus Vance",
    email: "marcus.vance@example.com",
    roleTitle: "Senior Full Stack Engineer",
    stage: "Review",
    appliedDate: "2026-11-05",
  },
];

const LOCAL_ROLES_KEY = "hireme_db_roles";
const LOCAL_CANDIDATES_KEY = "hireme_db_candidates";

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ROLES
export async function getRoles(): Promise<Role[]> {
  if (isFirebaseConfigured) {
    try {
      const q = query(collection(db, "roles"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Role));
      }
    } catch (e) {
      console.warn("Firestore read failed, falling back to local DB:", e);
    }
  }
  return getLocal<Role[]>(LOCAL_ROLES_KEY, DEFAULT_ROLES);
}

export async function createRole(newRole: Omit<Role, "id" | "createdAt">): Promise<Role> {
  const role: Role = {
    ...newRole,
    id: `role-${Date.now()}`,
    createdAt: new Date().toISOString().split("T")[0],
  };

  if (isFirebaseConfigured) {
    try {
      const docRef = await addDoc(collection(db, "roles"), role);
      role.id = docRef.id;
    } catch (e) {
      console.warn("Firestore write failed, saving locally:", e);
    }
  }

  const current = getLocal<Role[]>(LOCAL_ROLES_KEY, DEFAULT_ROLES);
  const updated = [role, ...current];
  setLocal(LOCAL_ROLES_KEY, updated);
  return role;
}

export async function deleteRole(id: string): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, "roles", id));
    } catch (e) {
      console.warn("Firestore delete failed:", e);
    }
  }

  const current = getLocal<Role[]>(LOCAL_ROLES_KEY, DEFAULT_ROLES);
  const updated = current.filter((r) => r.id !== id);
  setLocal(LOCAL_ROLES_KEY, updated);
}

// CANDIDATES
export async function getCandidates(): Promise<Candidate[]> {
  if (isFirebaseConfigured) {
    try {
      const q = query(collection(db, "candidates"), orderBy("appliedDate", "desc"));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Candidate));
      }
    } catch (e) {
      console.warn("Firestore read candidates failed, falling back to local DB:", e);
    }
  }
  return getLocal<Candidate[]>(LOCAL_CANDIDATES_KEY, DEFAULT_CANDIDATES);
}

export async function createCandidate(
  cand: Omit<Candidate, "id" | "appliedDate">
): Promise<Candidate> {
  const candidate: Candidate = {
    ...cand,
    id: `cand-${Date.now()}`,
    appliedDate: new Date().toISOString().split("T")[0],
  };

  if (isFirebaseConfigured) {
    try {
      const docRef = await addDoc(collection(db, "candidates"), candidate);
      candidate.id = docRef.id;
    } catch (e) {
      console.warn("Firestore candidate write failed, saving locally:", e);
    }
  }

  const current = getLocal<Candidate[]>(LOCAL_CANDIDATES_KEY, DEFAULT_CANDIDATES);
  const updated = [candidate, ...current];
  setLocal(LOCAL_CANDIDATES_KEY, updated);
  return candidate;
}

export async function updateCandidateStage(
  id: string,
  stage: Candidate["stage"]
): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, "candidates", id), { stage });
    } catch (e) {
      console.warn("Firestore update stage failed:", e);
    }
  }

  const current = getLocal<Candidate[]>(LOCAL_CANDIDATES_KEY, DEFAULT_CANDIDATES);
  const updated = current.map((c) => (c.id === id ? { ...c, stage } : c));
  setLocal(LOCAL_CANDIDATES_KEY, updated);
}
