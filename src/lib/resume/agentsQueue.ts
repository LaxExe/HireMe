import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, set, push } from "firebase/database";
import { isOnline, enqueueOfflineItem } from "@/lib/offlineSync";
import type { MasterResume } from "./types";
import { uid } from "./utils";

export interface AgentResumeEntry {
  id: string;
  sourcePreviewId?: string;
  roleName: string;
  roleUrl: string;
  fileName: string;
  tailoredResume: MasterResume;
  sentToCompany: boolean;
  sentAt?: string;
  archived: boolean;
  archivedAt?: string;
  createdAt: string;
}

const AGENTS_QUEUE_KEY = (uidStr: string) => `hireme_agents_queue_${uidStr}`;
const AGENTS_QUEUE_GLOBAL_KEY = "hireme_agents_queue_global";

export function buildResumePdfFileName(roleName: string, resumeName?: string): string {
  const cleanPart = (val: string, fallback: string) =>
    (val || fallback)
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback;

  const baseName = cleanPart(resumeName || "", "Resume");
  const rolePart = cleanPart(roleName, "Tailored_Role").slice(0, 48);
  return `${baseName}_${rolePart}.pdf`;
}

function normalizeAgentEntries(parsed: unknown): AgentResumeEntry[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw) => {
    const item = raw as Partial<AgentResumeEntry>;
    const roleName = item.roleName || "Software Engineer Role";
    const fileName =
      item.fileName ||
      buildResumePdfFileName(roleName, item.tailoredResume?.contact?.name);
    const sentToCompany = Boolean(item.sentToCompany);
    return {
      id: item.id || uid("ag"),
      sourcePreviewId: item.sourcePreviewId,
      roleName,
      roleUrl: item.roleUrl || "",
      fileName: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
      tailoredResume: item.tailoredResume as MasterResume,
      sentToCompany,
      sentAt: item.sentAt,
      archived: sentToCompany ? Boolean(item.archived) : false,
      archivedAt: sentToCompany && item.archived ? item.archivedAt : undefined,
      createdAt: item.createdAt || new Date().toISOString(),
    };
  });
}

export function loadAgentsQueue(uidStr: string): AgentResumeEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const rawUser = uidStr ? localStorage.getItem(AGENTS_QUEUE_KEY(uidStr)) : null;
    if (rawUser) {
      const items = normalizeAgentEntries(JSON.parse(rawUser));
      if (items.length > 0) return items;
    }
    const rawGlobal = localStorage.getItem(AGENTS_QUEUE_GLOBAL_KEY);
    if (rawGlobal) {
      return normalizeAgentEntries(JSON.parse(rawGlobal));
    }
    return [];
  } catch {
    return [];
  }
}

export async function loadAgentsQueueAsync(uidStr: string): Promise<AgentResumeEntry[]> {
  const local = loadAgentsQueue(uidStr);
  if (local.length > 0) return local;

  if (isFirebaseConfigured && uidStr) {
    try {
      const snap = await get(ref(rtdb, `agentsQueues/${uidStr}`));
      if (snap.exists()) {
        const val = snap.val();
        const data = val?.data;
        if (typeof data === "string") {
          const items = normalizeAgentEntries(JSON.parse(data));
          saveAgentsQueue(uidStr, items);
          return items;
        }
      }
    } catch (e) {
      console.warn("RTDB agents queue read failed, using local copy:", e);
    }
  }
  return local;
}

export function saveAgentsQueue(uidStr: string, items: AgentResumeEntry[]): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(items);
  const now = new Date().toISOString();

  // If online and Firebase is configured, write directly to the database
  if (isOnline() && isFirebaseConfigured && uidStr) {
    set(ref(rtdb, `agentsQueues/${uidStr}`), {
      data: serialized,
      updatedAt: now,
    }).catch((e) => {
      console.warn("Direct DB sync failed, falling back to offline queue:", e);
      enqueueOfflineItem({
        type: "agentsQueue",
        uid: uidStr,
        data: serialized,
        timestamp: now,
      });
    });
  } else {
    // Offline mode: store in local storage and queue for upload when WiFi returns
    enqueueOfflineItem({
      type: "agentsQueue",
      uid: uidStr,
      data: serialized,
      timestamp: now,
    });
  }

  // Also maintain fast local in-memory/cache for responsive UI
  try {
    if (uidStr) {
      localStorage.setItem(AGENTS_QUEUE_KEY(uidStr), serialized);
    }
    localStorage.setItem(AGENTS_QUEUE_GLOBAL_KEY, serialized);
  } catch (e) {
    console.warn("Local storage cache warning:", e);
  }
}

export function logAppliedJobToFirebase(
  jobTitle: string,
  jobUrl: string,
  status: "queued" | "applied"
): void {
  const timestamp = new Date().toISOString();
  const cleanTitle = jobTitle.trim() || "Untitled Role";
  const cleanUrl = (jobUrl || "").trim();

  // If online, write directly to database
  if (isOnline() && isFirebaseConfigured) {
    try {
      const jobLogRef = push(ref(rtdb, "appliedJobs"));
      set(jobLogRef, {
        jobTitle: cleanTitle,
        jobUrl: cleanUrl,
        status,
        timestamp,
      }).catch((e) => {
        console.warn("Online write failed, saving to offline sync queue:", e);
        enqueueOfflineItem({
          type: "appliedJob",
          jobTitle: cleanTitle,
          jobUrl: cleanUrl,
          status,
          timestamp,
        });
      });
      return;
    } catch (e) {
      console.warn("Online write error, saving to offline sync queue:", e);
    }
  }

  // Offline: save to offline queue so it will push to DB as soon as WiFi reconnects
  enqueueOfflineItem({
    type: "appliedJob",
    jobTitle: cleanTitle,
    jobUrl: cleanUrl,
    status,
    timestamp,
  });
}

export function pushResumeToAgents(
  uidStr: string,
  params: {
    sourcePreviewId?: string;
    roleName: string;
    roleUrl: string;
    tailoredResume: MasterResume;
    fileName?: string;
  }
): AgentResumeEntry {
  const existing = loadAgentsQueue(uidStr);
  const roleName = params.roleName.trim() || "Software Engineer Role";
  const resolvedFileName =
    params.fileName ||
    buildResumePdfFileName(roleName, params.tailoredResume.contact?.name);

  const newEntry: AgentResumeEntry = {
    id: uid("ag"),
    sourcePreviewId: params.sourcePreviewId,
    roleName,
    roleUrl: (params.roleUrl || "").trim(),
    fileName: resolvedFileName.endsWith(".pdf")
      ? resolvedFileName
      : `${resolvedFileName}.pdf`,
    tailoredResume: structuredClone(params.tailoredResume),
    sentToCompany: false,
    archived: false,
    createdAt: new Date().toISOString(),
  };

  const updated = [newEntry, ...existing];
  saveAgentsQueue(uidStr, updated);
  logAppliedJobToFirebase(roleName, params.roleUrl, "queued");
  return newEntry;
}

export function toggleAgentSentStatus(uidStr: string, entryId: string): AgentResumeEntry[] {
  const existing = loadAgentsQueue(uidStr);
  const now = new Date().toISOString();
  let toggledEntry: AgentResumeEntry | null = null;
  const updated = existing.map((entry) => {
    if (entry.id !== entryId) return entry;
    const nextSent = !entry.sentToCompany;
    toggledEntry = {
      ...entry,
      sentToCompany: nextSent,
      sentAt: nextSent ? now : undefined,
      archived: nextSent ? entry.archived : false,
      archivedAt: nextSent ? entry.archivedAt : undefined,
    };
    return toggledEntry;
  });
  saveAgentsQueue(uidStr, updated);
  if (toggledEntry && (toggledEntry as AgentResumeEntry).sentToCompany) {
    logAppliedJobToFirebase(
      (toggledEntry as AgentResumeEntry).roleName,
      (toggledEntry as AgentResumeEntry).roleUrl,
      "applied"
    );
  }
  return updated;
}

export function archiveAgentEntry(uidStr: string, entryId: string): AgentResumeEntry[] {
  const existing = loadAgentsQueue(uidStr);
  const now = new Date().toISOString();
  const updated = existing.map((entry) => {
    if (entry.id !== entryId || !entry.sentToCompany) return entry;
    return {
      ...entry,
      archived: true,
      archivedAt: now,
    };
  });
  saveAgentsQueue(uidStr, updated);
  return updated;
}

export function unarchiveAgentEntry(uidStr: string, entryId: string): AgentResumeEntry[] {
  const existing = loadAgentsQueue(uidStr);
  const updated = existing.map((entry) =>
    entry.id === entryId
      ? { ...entry, archived: false, archivedAt: undefined }
      : entry
  );
  saveAgentsQueue(uidStr, updated);
  return updated;
}

export function deleteAgentEntry(uidStr: string, entryId: string): AgentResumeEntry[] {
  const existing = loadAgentsQueue(uidStr);
  const updated = existing.filter((entry) => entry.id !== entryId);
  saveAgentsQueue(uidStr, updated);
  return updated;
}
