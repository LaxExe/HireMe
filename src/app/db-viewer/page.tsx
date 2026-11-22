"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  Sliders,
  ShieldAlert,
  Search,
  ArrowRight,
  User,
  Users,
  CheckCircle2,
  Clock,
  Archive,
  RotateCcw,
  Plus,
  X,
  Database,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import {
  subscribeAgentsQueue,
  type AgentResumeEntry,
} from "@/lib/resume/agentsQueue";
import {
  subscribePreviewQueue,
  type PreviewQueueItem,
} from "@/lib/resume/previewQueue";
import {
  subscribeDbViewerStore,
  archiveRecordInCloud,
  unarchiveRecordInCloud,
  restoreAllArchivedInCloud,
  mergeRecordsIntoStore,
  getRecordIdentifier,
  type DbViewerRecord,
  type DbViewerStoreData,
} from "@/lib/resume/dbViewerStore";

// Workspace owner UIDs
const OWNER_UIDS = new Set([
  "PvKPmKmpqSZMTW9w4XVqWK3Y8El1",
  "CtF9N7qVfcQse3DsZcPvkQ4dwCT2",
]);

// Authorized workspace accounts
const AUTHORIZED_VIEWER_EMAILS = [
  "lakshman.r.2008@gmail.com",
  "lakshmananramanathan08@gmail.com",
  "lakshmananramanthan08@gmail.com",
  "l2ramanathan@uwaterloo.ca",
  process.env.NEXT_PUBLIC_ADMIN_EMAIL,
]
  .filter(Boolean)
  .map((e) => e!.toLowerCase().trim());

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getDomainFromUrl(url: string): string {
  try {
    const raw = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(raw);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isRecordFromCurrentOwner(
  record: DbViewerRecord,
  currentUserUid?: string,
  currentUserEmail?: string
): boolean {
  if (currentUserUid && record.applicantId === currentUserUid) return true;
  if (OWNER_UIDS.has(record.applicantId)) return true;

  if (currentUserEmail && record.applicantEmail) {
    if (record.applicantEmail.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
      return true;
    }
  }

  const emailLower = (record.applicantEmail || "").toLowerCase().trim();
  if (emailLower) {
    if (AUTHORIZED_VIEWER_EMAILS.includes(emailLower)) return true;
    if (
      emailLower.includes("lakshman") ||
      emailLower.includes("ramanathan") ||
      emailLower.includes("ramanthan") ||
      emailLower.includes("l2ramanathan")
    ) {
      return true;
    }
  }

  const nameLower = (record.applicantName || "").toLowerCase().trim();
  if (
    nameLower.includes("lakshman") ||
    nameLower.includes("ramanathan") ||
    nameLower.includes("ramanthan")
  ) {
    return true;
  }

  return false;
}

export default function DbViewerPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Persistent store loaded directly from Firebase Realtime Database
  const [storeData, setStoreData] = useState<DbViewerStoreData>({
    jobs: [],
    archivedKeys: [],
    updatedAt: "",
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplicantKey, setSelectedApplicantKey] = useState<string>("all");
  const [permissionWarning, setPermissionWarning] = useState(false);

  // Tab: "active" vs "archived"
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");

  // Manual Add Record Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobUrl, setNewJobUrl] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [newCandidateEmail, setNewCandidateEmail] = useState("");
  const [isSubmittingNewJob, setIsSubmittingNewJob] = useState(false);

  // Current user's own queue items
  const [myAgentsEntries, setMyAgentsEntries] = useState<AgentResumeEntry[]>([]);
  const [myPreviewItems, setMyPreviewItems] = useState<PreviewQueueItem[]>([]);

  // Authentication gate
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/db-viewer");
    }
  }, [user, loading, router]);

  const isAuthorized = useMemo(() => {
    if (!user?.email) return false;
    return AUTHORIZED_VIEWER_EMAILS.includes(user.email.toLowerCase().trim());
  }, [user]);

  // Subscribe to persistent store in Firebase Realtime Database (previewQueues/${user.uid}/dbViewerStore)
  useEffect(() => {
    if (!user || !isAuthorized) {
      setDataLoading(false);
      return;
    }

    const unsubscribe = subscribeDbViewerStore(user.uid, (data) => {
      setStoreData(data);
      setDataLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user, isAuthorized]);

  // Listen for incoming appliedJobs records from RTDB and merge into the cloud store
  useEffect(() => {
    if (!user || !isAuthorized || !isFirebaseConfigured || !rtdb) {
      return;
    }

    const appliedRef = ref(rtdb, "appliedJobs");
    const unsubscribe = onValue(
      appliedRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          if (val && typeof val === "object") {
            const incomingRecords: DbViewerRecord[] = [];
            for (const [key, raw] of Object.entries(val)) {
              if (!raw || typeof raw !== "object") continue;
              const item = raw as Record<string, any>;
              const title = item.jobTitle || item.roleName || "Untitled Role";
              const url = item.jobUrl || item.roleUrl || "";
              const time = item.timestamp || item.addedAt || new Date().toISOString();
              const email = (item.userEmail || "").trim();
              const applicantId = item.userId || "unknown";
              const name = email ? email.split("@")[0] : "Record";

              const record: DbViewerRecord = {
                id: key,
                jobTitle: title,
                jobUrl: url,
                timestamp: time,
                applicantId,
                applicantName: name,
                applicantEmail: email,
                source: "appliedJobs",
              };

              if (!isRecordFromCurrentOwner(record, user.uid, user.email || undefined)) {
                incomingRecords.push(record);
              }
            }

            if (incomingRecords.length > 0) {
              mergeRecordsIntoStore(user.uid, incomingRecords).catch((e) => {
                console.warn("Could not merge incoming records into store:", e);
              });
            }
          }
        }
      },
      (err) => {
        console.warn("Live appliedJobs table restricted:", err.message);
        setPermissionWarning(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, isAuthorized]);

  // Subscribe to current user's own queues
  useEffect(() => {
    if (!user) return;
    const unsubAgents = subscribeAgentsQueue(user.uid, (entries) => {
      setMyAgentsEntries(entries);
    });
    const unsubPreview = subscribePreviewQueue(user.uid, (items) => {
      setMyPreviewItems(items);
    });
    return () => {
      unsubAgents();
      unsubPreview();
    };
  }, [user]);

  const myJobIdentifiers = useMemo(() => {
    const urls = new Set<string>();
    const titles = new Set<string>();

    const normalizeUrl = (u?: string) =>
      u ? u.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").trim() : "";
    const normalizeTitle = (t?: string) =>
      t ? t.toLowerCase().replace(/[^a-z0-9]/g, "").trim() : "";

    for (const e of myAgentsEntries) {
      if (e.roleUrl) urls.add(normalizeUrl(e.roleUrl));
      if (e.roleName) titles.add(normalizeTitle(e.roleName));
    }
    for (const p of myPreviewItems) {
      if (p.roleUrl) urls.add(normalizeUrl(p.roleUrl));
      if (p.roleName) titles.add(normalizeTitle(p.roleName));
      if (p.title) titles.add(normalizeTitle(p.title));
    }

    return { urls, titles, normalizeUrl, normalizeTitle };
  }, [myAgentsEntries, myPreviewItems]);

  const handleArchiveJob = async (job: DbViewerRecord) => {
    if (!user) return;
    await archiveRecordInCloud(user.uid, job);
  };

  const handleUnarchiveJob = async (job: DbViewerRecord) => {
    if (!user) return;
    await unarchiveRecordInCloud(user.uid, job);
  };

  const handleRestoreAllArchived = async () => {
    if (!user) return;
    await restoreAllArchivedInCloud(user.uid);
  };

  const handleAddJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newJobTitle.trim()) return;

    setIsSubmittingNewJob(true);
    try {
      const cleanTitle = newJobTitle.trim();
      const cleanUrl = newJobUrl.trim();
      const name = newCandidateName.trim() || "Manual Entry";
      const email = newCandidateEmail.trim();

      const newEntry: DbViewerRecord = {
        id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        jobTitle: cleanTitle,
        jobUrl: cleanUrl,
        timestamp: new Date().toISOString(),
        applicantId: "manual_entry",
        applicantName: name,
        applicantEmail: email,
        source: "manual",
      };

      await mergeRecordsIntoStore(user.uid, [newEntry]);
      setNewJobTitle("");
      setNewJobUrl("");
      setNewCandidateName("");
      setNewCandidateEmail("");
      setIsAddModalOpen(false);
    } catch (err) {
      console.error("Failed to add record:", err);
    } finally {
      setIsSubmittingNewJob(false);
    }
  };

  const eligibleJobs = useMemo(() => {
    if (!user) return [];
    const myUid = user.uid;
    const myEmail = user.email || "";
    const { urls, titles, normalizeUrl, normalizeTitle } = myJobIdentifiers;

    return storeData.jobs.filter((job) => {
      if (isRecordFromCurrentOwner(job, myUid, myEmail)) return false;

      const normUrl = normalizeUrl(job.jobUrl);
      if (normUrl && urls.has(normUrl)) return false;

      const normTitle = normalizeTitle(job.jobTitle);
      if (normTitle && titles.has(normTitle)) return false;

      return true;
    });
  }, [storeData.jobs, user, myJobIdentifiers]);

  const { activeJobs, archivedJobs } = useMemo(() => {
    const active: DbViewerRecord[] = [];
    const archived: DbViewerRecord[] = [];

    const archiveSet = new Set(storeData.archivedKeys);

    for (const job of eligibleJobs) {
      const key = getRecordIdentifier(job);
      if (archiveSet.has(job.id) || archiveSet.has(key)) {
        archived.push(job);
      } else {
        active.push(job);
      }
    }

    return { activeJobs: active, archivedJobs: archived };
  }, [eligibleJobs, storeData.archivedKeys]);

  const currentViewJobs = viewTab === "active" ? activeJobs : archivedJobs;

  const applicantsList = useMemo(() => {
    const map = new Map<string, { key: string; name: string; email?: string; count: number }>();
    for (const job of currentViewJobs) {
      const key = job.applicantEmail || job.applicantId || "other";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          key,
          name: job.applicantName || key,
          email: job.applicantEmail,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [currentViewJobs]);

  useEffect(() => {
    if (selectedApplicantKey !== "all") {
      const exists = currentViewJobs.some(
        (job) => (job.applicantEmail || job.applicantId || "other") === selectedApplicantKey
      );
      if (!exists) {
        setSelectedApplicantKey("all");
      }
    }
  }, [viewTab, currentViewJobs, selectedApplicantKey]);

  const displayedJobs = useMemo(() => {
    return currentViewJobs.filter((job) => {
      if (selectedApplicantKey !== "all") {
        const key = job.applicantEmail || job.applicantId || "other";
        if (key !== selectedApplicantKey) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          job.jobTitle.toLowerCase().includes(q) ||
          job.jobUrl.toLowerCase().includes(q) ||
          job.applicantName.toLowerCase().includes(q) ||
          job.applicantEmail.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [currentViewJobs, selectedApplicantKey, searchQuery]);

  if (loading || (user && isAuthorized && dataLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center py-24 text-xs font-mono text-neutral-400">
        Loading database records...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAuthorized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center space-y-3 animate-fadeIn">
        <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
          <ShieldAlert className="w-5 h-5 text-neutral-800" />
        </div>
        <h1 className="text-sm font-semibold tracking-tight text-neutral-900">
          Access Restricted
        </h1>
        <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
          Database Viewer is restricted to authorized workspace accounts.
        </p>
        <Link
          href="/experience"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer mt-2"
        >
          <span>Return to Workspace</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  const handleAddToMyOperations = (job: DbViewerRecord) => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "hireme_operations_prefill",
          JSON.stringify({
            roleName: job.jobTitle,
            roleUrl: job.jobUrl,
          })
        );
      } catch {}
    }
    const params = new URLSearchParams();
    if (job.jobTitle) params.set("roleName", job.jobTitle);
    if (job.jobUrl) params.set("roleUrl", job.jobUrl);
    router.push(`/operations?${params.toString()}`);
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full py-8 sm:py-12 px-4 sm:px-6 space-y-6 pb-24 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#ebebeb] pb-5 gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
              db viewer
            </h1>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="w-2.5 h-2.5 text-emerald-600" />
              RTDB Synced
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Realtime database record inspector and archive browser.
          </p>
        </div>

        {/* View mode toggle & Add Record */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg border border-[#ebebeb]">
            <button
              type="button"
              onClick={() => setViewTab("active")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                viewTab === "active"
                  ? "bg-white text-neutral-900 shadow-2xs font-semibold"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              <span>Active Records</span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                  viewTab === "active"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {activeJobs.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab("archived")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                viewTab === "archived"
                  ? "bg-white text-neutral-900 shadow-2xs font-semibold"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              <Archive className="w-3 h-3" />
              <span>Archived</span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                  viewTab === "archived"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {archivedJobs.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
            title="Add a record to the database viewer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Record</span>
          </button>

          {viewTab === "archived" && archivedJobs.length > 0 && (
            <button
              type="button"
              onClick={handleRestoreAllArchived}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Restore all archived records back to active table"
            >
              <RotateCcw className="w-3 h-3 text-neutral-400" />
              <span>Restore All</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Record Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-[#ebebeb] shadow-modal w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#ebebeb] pb-3">
              <div className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-neutral-900" />
                <h3 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Add Record to DB Viewer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddJobSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Role Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OpenAI — Research Engineer"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 transition-colors text-neutral-900 placeholder:text-neutral-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Posting URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newJobUrl}
                  onChange={(e) => setNewJobUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 transition-colors text-neutral-900 placeholder:text-neutral-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Source Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. External"
                    value={newCandidateName}
                    onChange={(e) => setNewCandidateName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 transition-colors text-neutral-900 placeholder:text-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Source Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={newCandidateEmail}
                    onChange={(e) => setNewCandidateEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 transition-colors text-neutral-900 placeholder:text-neutral-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#ebebeb]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewJob || !newJobTitle.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow-subtle active:scale-95 transition-all cursor-pointer"
                >
                  <Database className="w-3 h-3" />
                  <span>{isSubmittingNewJob ? "Saving to DB..." : "Save to DB"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {permissionWarning && (
        <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs text-neutral-700 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-neutral-900">Cloud Database Synchronization Active</p>
            <p className="text-neutral-500 text-[11px] leading-relaxed">
              Your database table is synced across devices via Firebase Realtime Database.
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      {applicantsList.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1">
              <Users className="w-3 h-3 text-neutral-400" />
              <span>
                Filter by Source ({applicantsList.length}) {viewTab === "archived" ? "— Archived" : ""}
              </span>
            </span>
            {selectedApplicantKey !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedApplicantKey("all")}
                className="font-mono text-[10px] text-neutral-500 hover:text-neutral-900 underline transition-colors cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedApplicantKey("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
                selectedApplicantKey === "all"
                  ? "bg-neutral-900 text-white font-medium shadow-subtle"
                  : "bg-white border border-[#ebebeb] text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <Users className="w-3 h-3" />
              <span>All Sources</span>
              <span
                className={`font-mono text-[10px] ml-0.5 ${
                  selectedApplicantKey === "all" ? "text-neutral-300" : "text-neutral-400"
                }`}
              >
                {currentViewJobs.length}
              </span>
            </button>

            {applicantsList.map((app) => {
              const isSelected = selectedApplicantKey === app.key;
              return (
                <button
                  key={app.key}
                  type="button"
                  onClick={() => setSelectedApplicantKey(app.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
                    isSelected
                      ? "bg-neutral-900 text-white font-medium shadow-subtle"
                      : "bg-white border border-[#ebebeb] text-neutral-600 hover:border-neutral-300"
                  }`}
                >
                  <User className="w-3 h-3" />
                  <span>{app.name}</span>
                  <span
                    className={`font-mono text-[10px] ml-0.5 ${
                      isSelected ? "text-neutral-300" : "text-neutral-400"
                    }`}
                  >
                    {app.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter database records by title, domain, or source..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-xl focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs text-neutral-900 placeholder:text-neutral-400"
        />
      </div>

      {/* Records List */}
      <div className="space-y-3">
        {displayedJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#ebebeb] p-8 text-center space-y-2 shadow-2xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-xs font-medium text-neutral-800">
              {searchQuery
                ? "No matching records found"
                : viewTab === "archived"
                ? "No archived records"
                : archivedJobs.length > 0 && activeJobs.length === 0
                ? "All records have been archived"
                : "No records in database table yet"}
            </p>
            <p className="text-[11px] text-neutral-500 max-w-sm mx-auto leading-relaxed">
              {searchQuery
                ? "Try searching for a different keyword."
                : viewTab === "archived"
                ? "Archived records are preserved in the database so you can restore them anytime."
                : archivedJobs.length > 0 && activeJobs.length === 0
                ? "All incoming records in the table are currently archived."
                : "Synced records from the Realtime Database will appear here."}
            </p>
            {viewTab === "active" && archivedJobs.length > 0 && activeJobs.length === 0 && (
              <button
                type="button"
                onClick={() => setViewTab("archived")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer mt-2"
              >
                <Archive className="w-3 h-3 text-neutral-500" />
                <span>View {archivedJobs.length} Archived Records</span>
              </button>
            )}
            {viewTab === "active" && eligibleJobs.length === 0 && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer mt-2"
              >
                <Plus className="w-3 h-3" />
                <span>Add Record to Database</span>
              </button>
            )}
          </div>
        ) : (
          displayedJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-neutral-300"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    {job.jobTitle}
                  </h2>
                  <span className="font-mono text-[10px] text-neutral-400">
                    {formatDate(job.timestamp)}
                  </span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                    <User className="w-3 h-3 text-neutral-500" />
                    <span className="font-medium text-neutral-800">{job.applicantName}</span>
                    {job.applicantEmail && job.applicantEmail !== job.applicantName && (
                      <span className="text-neutral-400 text-[10px]">({job.applicantEmail})</span>
                    )}
                  </span>

                  {job.jobUrl && (
                    <a
                      href={job.jobUrl.startsWith("http") ? job.jobUrl : `https://${job.jobUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline flex items-center gap-1 transition-colors truncate max-w-xs"
                    >
                      <span>{getDomainFromUrl(job.jobUrl)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {job.jobUrl && (
                  <a
                    href={job.jobUrl.startsWith("http") ? job.jobUrl : `https://${job.jobUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Open external link"
                  >
                    <span>Open URL</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleAddToMyOperations(job)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-subtle active:scale-95 transition-all cursor-pointer"
                  title="Load into Operations workspace"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Load in Operations</span>
                </button>

                {viewTab === "active" ? (
                  <button
                    type="button"
                    onClick={() => handleArchiveJob(job)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Archive record in database"
                  >
                    <Archive className="w-3 h-3 text-neutral-400" />
                    <span>Archive</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnarchiveJob(job)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Restore record to active view"
                  >
                    <RotateCcw className="w-3 h-3 text-neutral-500" />
                    <span>Restore</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
