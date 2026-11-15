"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  Sliders,
  ShieldAlert,
  Search,
  Sparkles,
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
  subscribeSecretJobsStore,
  archiveJobInCloud,
  unarchiveJobInCloud,
  restoreAllArchivedInCloud,
  mergeJobsIntoStore,
  getJobIdentifier,
  type CandidateAppliedJob,
  type SecretJobsStoreData,
} from "@/lib/resume/secretJobsStore";

// Known administrator UIDs
const ADMIN_UIDS = new Set([
  "PvKPmKmpqSZMTW9w4XVqWK3Y8El1", // lakshman.r.2008@gmail.com
  "CtF9N7qVfcQse3DsZcPvkQ4dwCT2", // lakshmananramanathan08@gmail.com
]);

// Authorized administrator email list (with typos/aliases handled)
const AUTHORIZED_ADMIN_EMAILS = [
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

/**
 * Checks if a job belongs to the current user or administrator identity
 * to ensure that admin jobs (including lakshmananramanathan08@gmail.com)
 * are NEVER displayed in the candidate stream.
 */
function isJobFromAdminOrSelf(
  job: CandidateAppliedJob,
  currentUserUid?: string,
  currentUserEmail?: string
): boolean {
  // 1. Current user UID or known Admin UIDs
  if (currentUserUid && job.applicantId === currentUserUid) return true;
  if (ADMIN_UIDS.has(job.applicantId)) return true;

  // 2. Current user email match
  if (currentUserEmail && job.applicantEmail) {
    if (job.applicantEmail.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
      return true;
    }
  }

  // 3. Known Admin emails / patterns
  const emailLower = (job.applicantEmail || "").toLowerCase().trim();
  if (emailLower) {
    if (AUTHORIZED_ADMIN_EMAILS.includes(emailLower)) return true;
    if (
      emailLower.includes("lakshman") ||
      emailLower.includes("ramanathan") ||
      emailLower.includes("ramanthan") ||
      emailLower.includes("l2ramanathan")
    ) {
      return true;
    }
  }

  // 4. Admin name match
  const nameLower = (job.applicantName || "").toLowerCase().trim();
  if (
    nameLower.includes("lakshman") ||
    nameLower.includes("ramanathan") ||
    nameLower.includes("ramanthan")
  ) {
    return true;
  }

  return false;
}

export default function SecretJobsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Persistent store loaded directly from Firebase Realtime Database
  const [storeData, setStoreData] = useState<SecretJobsStoreData>({
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

  // Manual Add Job Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobUrl, setNewJobUrl] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [newCandidateEmail, setNewCandidateEmail] = useState("");
  const [isSubmittingNewJob, setIsSubmittingNewJob] = useState(false);

  // Current user's own queue items (to exclude jobs already applied to or queued)
  const [myAgentsEntries, setMyAgentsEntries] = useState<AgentResumeEntry[]>([]);
  const [myPreviewItems, setMyPreviewItems] = useState<PreviewQueueItem[]>([]);

  // Authentication gate
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/secret/jobs");
    }
  }, [user, loading, router]);

  const isAuthorized = useMemo(() => {
    if (!user?.email) return false;
    return AUTHORIZED_ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
  }, [user]);

  // Subscribe to persistent store in Firebase Realtime Database (previewQueues/${user.uid}/secretJobsStore)
  // This guarantees identical jobs and archive states across any computer!
  useEffect(() => {
    if (!user || !isAuthorized) {
      setDataLoading(false);
      return;
    }

    const unsubscribe = subscribeSecretJobsStore(user.uid, (data) => {
      setStoreData(data);
      setDataLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user, isAuthorized]);

  // Also listen for incoming appliedJobs stream from RTDB and merge into the cloud store
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
            const incomingJobs: CandidateAppliedJob[] = [];
            for (const [key, raw] of Object.entries(val)) {
              if (!raw || typeof raw !== "object") continue;
              const item = raw as Record<string, any>;
              const title = item.jobTitle || item.roleName || "Untitled Role";
              const url = item.jobUrl || item.roleUrl || "";
              const time = item.timestamp || item.addedAt || new Date().toISOString();
              const email = (item.userEmail || "").trim();
              const applicantId = item.userId || "unknown";
              const name = email ? email.split("@")[0] : "Candidate";

              const candidateJob: CandidateAppliedJob = {
                id: key,
                jobTitle: title,
                jobUrl: url,
                timestamp: time,
                applicantId,
                applicantName: name,
                applicantEmail: email,
                source: "appliedJobs",
              };

              // Exclude admin's own submissions
              if (!isJobFromAdminOrSelf(candidateJob, user.uid, user.email || undefined)) {
                incomingJobs.push(candidateJob);
              }
            }

            if (incomingJobs.length > 0) {
              // Automatically persist any incoming external jobs to the user's cloud store
              mergeJobsIntoStore(user.uid, incomingJobs).catch((e) => {
                console.warn("Could not merge incoming appliedJobs into store:", e);
              });
            }
          }
        }
      },
      (err) => {
        console.warn("Live appliedJobs stream restricted:", err.message);
        setPermissionWarning(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, isAuthorized]);

  // Subscribe to current user's own queues to track what they already have
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

  // Build sets of normalized identifiers for current user's existing jobs
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

  // Archive / Restore handlers that write straight to the database
  const handleArchiveJob = async (job: CandidateAppliedJob) => {
    if (!user) return;
    await archiveJobInCloud(user.uid, job);
  };

  const handleUnarchiveJob = async (job: CandidateAppliedJob) => {
    if (!user) return;
    await unarchiveJobInCloud(user.uid, job);
  };

  const handleRestoreAllArchived = async () => {
    if (!user) return;
    await restoreAllArchivedInCloud(user.uid);
  };

  // Submit manual job into database store
  const handleAddJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newJobTitle.trim()) return;

    setIsSubmittingNewJob(true);
    try {
      const cleanTitle = newJobTitle.trim();
      const cleanUrl = newJobUrl.trim();
      const name = newCandidateName.trim() || "Manual Candidate";
      const email = newCandidateEmail.trim();

      const newEntry: CandidateAppliedJob = {
        id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        jobTitle: cleanTitle,
        jobUrl: cleanUrl,
        timestamp: new Date().toISOString(),
        applicantId: "manual_entry",
        applicantName: name,
        applicantEmail: email,
        source: "manual",
      };

      await mergeJobsIntoStore(user.uid, [newEntry]);
      setNewJobTitle("");
      setNewJobUrl("");
      setNewCandidateName("");
      setNewCandidateEmail("");
      setIsAddModalOpen(false);
    } catch (err) {
      console.error("Failed to add custom job:", err);
    } finally {
      setIsSubmittingNewJob(false);
    }
  };

  // Filter out any jobs the current user or admin accounts applied to,
  // or that already exist in the user's Preview or Agents queues
  const eligibleJobs = useMemo(() => {
    if (!user) return [];
    const myUid = user.uid;
    const myEmail = user.email || "";
    const { urls, titles, normalizeUrl, normalizeTitle } = myJobIdentifiers;

    return storeData.jobs.filter((job) => {
      // 1. Exclude if submitted by admin, current user, or matches personal admin identity
      if (isJobFromAdminOrSelf(job, myUid, myEmail)) return false;

      // 2. Exclude if the current user already has this job in their Agents or Preview queues
      const normUrl = normalizeUrl(job.jobUrl);
      if (normUrl && urls.has(normUrl)) return false;

      const normTitle = normalizeTitle(job.jobTitle);
      if (normTitle && titles.has(normTitle)) return false;

      return true;
    });
  }, [storeData.jobs, user, myJobIdentifiers]);

  // Partition into Active and Archived sets based on DB-synced archivedKeys
  const { activeJobs, archivedJobs } = useMemo(() => {
    const active: CandidateAppliedJob[] = [];
    const archived: CandidateAppliedJob[] = [];

    const archiveSet = new Set(storeData.archivedKeys);

    for (const job of eligibleJobs) {
      const key = getJobIdentifier(job);
      if (archiveSet.has(job.id) || archiveSet.has(key)) {
        archived.push(job);
      } else {
        active.push(job);
      }
    }

    return { activeJobs: active, archivedJobs: archived };
  }, [eligibleJobs, storeData.archivedKeys]);

  const currentViewJobs = viewTab === "active" ? activeJobs : archivedJobs;

  // Group current view jobs by applicant for the "by user" navigation
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

  // Reset selected applicant if they have 0 jobs in the current view
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

  // Filter jobs by applicant and search query
  const displayedJobs = useMemo(() => {
    return currentViewJobs.filter((job) => {
      // Filter by applicant if selected
      if (selectedApplicantKey !== "all") {
        const key = job.applicantEmail || job.applicantId || "other";
        if (key !== selectedApplicantKey) return false;
      }

      // Filter by search query
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

  // Loading state
  if (loading || (user && isAuthorized && dataLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center py-24 text-xs font-mono text-neutral-400">
        Syncing confidential database stream...
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return null;
  }

  // Unauthorized access gate
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
          This confidential stream is private and restricted to authorized administrator accounts.
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

  // 1-Click: Add job directly to Operations
  const handleAddToMyOperations = (job: CandidateAppliedJob) => {
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
              platform applications
            </h1>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-900 text-white font-medium">
              <Sparkles className="w-2.5 h-2.5" />
              Private Stream
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="w-2.5 h-2.5 text-emerald-600" />
              DB Synced
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Jobs discovered across the platform stored in the cloud database. Synced across all your computers and devices.
          </p>
        </div>

        {/* View mode toggle & Add Job */}
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
              <span>Active Feed</span>
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
            title="Add a custom or external job to the database feed"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Job</span>
          </button>

          {viewTab === "archived" && archivedJobs.length > 0 && (
            <button
              type="button"
              onClick={handleRestoreAllArchived}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Restore all archived jobs back to active feed in DB"
            >
              <RotateCcw className="w-3 h-3 text-neutral-400" />
              <span>Restore All</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Job Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-[#ebebeb] shadow-modal w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#ebebeb] pb-3">
              <div className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-neutral-900" />
                <h3 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Add Job to Secret Feed
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
                    Candidate Name / Source
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Platform Shared"
                    value={newCandidateName}
                    onChange={(e) => setNewCandidateName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 transition-colors text-neutral-900 placeholder:text-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Candidate Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="candidate@example.com"
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

      {/* Permission Warning banner if RTDB global appliedJobs rule blocks public reads */}
      {permissionWarning && (
        <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs text-neutral-700 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-neutral-900">Cloud Database Synchronization Active</p>
            <p className="text-neutral-500 text-[11px] leading-relaxed">
              Your secret stream is synced across computers via Firebase Realtime Database. Any job you add or archive is instantly preserved.
            </p>
          </div>
        </div>
      )}

      {/* "By User" Candidate Filter Bar */}
      {applicantsList.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1">
              <Users className="w-3 h-3 text-neutral-400" />
              <span>
                Browse by Candidate ({applicantsList.length}) {viewTab === "archived" ? "— Archived" : ""}
              </span>
            </span>
            {selectedApplicantKey !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedApplicantKey("all")}
                className="font-mono text-[10px] text-neutral-500 hover:text-neutral-900 underline transition-colors cursor-pointer"
              >
                Reset to All Candidates
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
              <span>All Other Candidates</span>
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
          placeholder="Search by job title, company, or link..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#ebebeb] rounded-xl focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs text-neutral-900 placeholder:text-neutral-400"
        />
      </div>

      {/* Jobs Feed */}
      <div className="space-y-3">
        {displayedJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#ebebeb] p-8 text-center space-y-2 shadow-2xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-xs font-medium text-neutral-800">
              {searchQuery
                ? "No matching jobs found"
                : viewTab === "archived"
                ? "No archived jobs"
                : archivedJobs.length > 0 && activeJobs.length === 0
                ? "All available jobs have been archived"
                : "No external jobs in database stream yet"}
            </p>
            <p className="text-[11px] text-neutral-500 max-w-sm mx-auto leading-relaxed">
              {searchQuery
                ? "Try searching for a different company name or keyword."
                : viewTab === "archived"
                ? "Jobs you archive from your secret feed are preserved in the database so you can restore them anytime from any computer."
                : archivedJobs.length > 0 && activeJobs.length === 0
                ? "You have archived every incoming job in the stream."
                : "Whenever candidates on the platform apply or queue positions, they will stream here and sync to your account in the cloud database."}
            </p>
            {viewTab === "active" && archivedJobs.length > 0 && activeJobs.length === 0 && (
              <button
                type="button"
                onClick={() => setViewTab("archived")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer mt-2"
              >
                <Archive className="w-3 h-3 text-neutral-500" />
                <span>View {archivedJobs.length} Archived Jobs</span>
              </button>
            )}
            {viewTab === "active" && eligibleJobs.length === 0 && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer mt-2"
              >
                <Plus className="w-3 h-3" />
                <span>Add First Job to Database</span>
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
                  {/* Candidate source pill */}
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                    <User className="w-3 h-3 text-neutral-500" />
                    <span className="font-medium text-neutral-800">{job.applicantName}</span>
                    {job.applicantEmail && job.applicantEmail !== job.applicantName && (
                      <span className="text-neutral-400 text-[10px]">({job.applicantEmail})</span>
                    )}
                  </span>

                  {/* Domain Link */}
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

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {job.jobUrl && (
                  <a
                    href={job.jobUrl.startsWith("http") ? job.jobUrl : `https://${job.jobUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Open external job application posting"
                  >
                    <span>Open Posting</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleAddToMyOperations(job)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-subtle active:scale-95 transition-all cursor-pointer"
                  title="Import into your Operations workspace to tailor resume and apply"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Add to My Operations</span>
                </button>

                {/* Archive / Restore Button */}
                {viewTab === "active" ? (
                  <button
                    type="button"
                    onClick={() => handleArchiveJob(job)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Archive this job in cloud database"
                  >
                    <Archive className="w-3 h-3 text-neutral-400" />
                    <span>Archive</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnarchiveJob(job)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Restore job to active feed in cloud database"
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
