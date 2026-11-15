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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, onValue, get, set } from "firebase/database";
import {
  subscribeAgentsQueue,
  type AgentResumeEntry,
} from "@/lib/resume/agentsQueue";
import {
  subscribePreviewQueue,
  type PreviewQueueItem,
} from "@/lib/resume/previewQueue";

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

export interface CandidateAppliedJob {
  id: string;
  jobTitle: string;
  jobUrl: string;
  timestamp: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  source: "appliedJobs" | "agentsQueue";
}

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

const ARCHIVE_STORAGE_PREFIX = "hireme_secret_archived_jobs_";

function getJobKey(job: { jobTitle: string; jobUrl: string }): string {
  const normTitle = (job.jobTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const normUrl = (job.jobUrl || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .trim();
  return `${normTitle}|${normUrl}`;
}

function loadLocalArchivedKeys(uid?: string): string[] {
  if (typeof window === "undefined" || !uid) return [];
  try {
    const raw = localStorage.getItem(`${ARCHIVE_STORAGE_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalArchivedKeys(uid: string | undefined, keys: string[]) {
  if (typeof window === "undefined" || !uid) return;
  try {
    localStorage.setItem(`${ARCHIVE_STORAGE_PREFIX}${uid}`, JSON.stringify(keys));
  } catch {}
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

  const [rawJobs, setRawJobs] = useState<CandidateAppliedJob[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplicantKey, setSelectedApplicantKey] = useState<string>("all");
  const [permissionError, setPermissionError] = useState(false);

  // Tab: "active" vs "archived"
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [archivedKeys, setArchivedKeys] = useState<string[]>([]);

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

  // Load archived keys on mount & sync with RTDB
  useEffect(() => {
    if (!user) return;
    const local = loadLocalArchivedKeys(user.uid);
    setArchivedKeys(local);

    if (rtdb && isFirebaseConfigured) {
      get(ref(rtdb, `userSecretArchivedJobs/${user.uid}`))
        .then((snap) => {
          if (snap.exists()) {
            const remote = snap.val();
            if (Array.isArray(remote)) {
              const merged = Array.from(new Set([...local, ...remote]));
              setArchivedKeys(merged);
              saveLocalArchivedKeys(user.uid, merged);
            }
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const persistArchivedKeys = useCallback(
    (keys: string[]) => {
      if (!user) return;
      saveLocalArchivedKeys(user.uid, keys);
      if (rtdb && isFirebaseConfigured) {
        set(ref(rtdb, `userSecretArchivedJobs/${user.uid}`), keys).catch(() => {});
      }
    },
    [user]
  );

  const handleArchiveJob = (job: CandidateAppliedJob) => {
    const key = getJobKey(job);
    const updated = Array.from(new Set([...archivedKeys, job.id, key]));
    setArchivedKeys(updated);
    persistArchivedKeys(updated);
  };

  const handleUnarchiveJob = (job: CandidateAppliedJob) => {
    const key = getJobKey(job);
    const updated = archivedKeys.filter((k) => k !== job.id && k !== key);
    setArchivedKeys(updated);
    persistArchivedKeys(updated);
  };

  const handleRestoreAllArchived = () => {
    setArchivedKeys([]);
    persistArchivedKeys([]);
  };

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

  // Fetch all applied jobs across all users from RTDB
  useEffect(() => {
    if (!user || !isAuthorized || !isFirebaseConfigured) {
      setDataLoading(false);
      return;
    }

    const jobMap = new Map<string, CandidateAppliedJob>();

    const updateFromSnapshot = (
      appliedVal: Record<string, any> | null,
      queuesVal: Record<string, any> | null
    ) => {
      // 1. Ingest from global appliedJobs table
      if (appliedVal && typeof appliedVal === "object") {
        for (const [key, val] of Object.entries(appliedVal)) {
          if (!val || typeof val !== "object") continue;
          const title = val.jobTitle || val.roleName || "Untitled Role";
          const url = val.jobUrl || val.roleUrl || "";
          const time = val.timestamp || val.addedAt || new Date().toISOString();
          const email = (val.userEmail || "").trim();
          const applicantId = val.userId || "unknown";
          const name = email ? email.split("@")[0] : "Candidate";

          const dedupeKey = `${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`;
          if (!jobMap.has(dedupeKey)) {
            jobMap.set(dedupeKey, {
              id: key,
              jobTitle: title,
              jobUrl: url,
              timestamp: time,
              applicantId,
              applicantName: name,
              applicantEmail: email,
              source: "appliedJobs",
            });
          }
        }
      }

      // 2. Ingest from user queues in agentsQueues table
      if (queuesVal && typeof queuesVal === "object") {
        for (const [uidKey, userNode] of Object.entries(queuesVal)) {
          if (!userNode || typeof userNode !== "object") continue;
          const rawData = userNode.data;
          let entries: AgentResumeEntry[] = [];
          if (typeof rawData === "string") {
            try {
              entries = JSON.parse(rawData);
            } catch {}
          } else if (Array.isArray(rawData)) {
            entries = rawData;
          }

          for (const entry of entries) {
            const title = entry.roleName || "Untitled Role";
            const url = entry.roleUrl || "";
            const time = entry.sentAt || entry.createdAt || new Date().toISOString();
            const email = (entry.tailoredResume?.contact?.email || "").trim();
            const name =
              entry.tailoredResume?.contact?.name?.trim() ||
              (email ? email.split("@")[0] : `User ${uidKey.slice(0, 5)}`);
            const dedupeKey = `${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`;

            if (!jobMap.has(dedupeKey)) {
              jobMap.set(dedupeKey, {
                id: entry.id || dedupeKey,
                jobTitle: title,
                jobUrl: url,
                timestamp: time,
                applicantId: uidKey,
                applicantName: name,
                applicantEmail: email,
                source: "agentsQueue",
              });
            }
          }
        }
      }

      const list = Array.from(jobMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRawJobs(list);
      setDataLoading(false);
    };

    // Live subscription on appliedJobs
    const appliedRef = ref(rtdb, "appliedJobs");
    let currentApplied: Record<string, any> | null = null;
    let currentQueues: Record<string, any> | null = null;

    const unsubApplied = onValue(
      appliedRef,
      (snap) => {
        currentApplied = snap.exists() ? snap.val() : null;
        updateFromSnapshot(currentApplied, currentQueues);
      },
      (err) => {
        console.warn("appliedJobs stream restricted or unavailable:", err.message);
        setPermissionError(true);
        setDataLoading(false);
      }
    );

    // Also attempt bulk load of agentsQueues to gather all prior jobs across candidates
    get(ref(rtdb, "agentsQueues"))
      .then((snap) => {
        if (snap.exists()) {
          currentQueues = snap.val();
          updateFromSnapshot(currentApplied, currentQueues);
        }
      })
      .catch((err) => {
        console.warn("agentsQueues bulk load restricted or unavailable:", err.message);
      });

    return () => {
      unsubApplied();
    };
  }, [user, isAuthorized]);

  // Filter out any jobs the current user or admin accounts applied to,
  // or that already exist in the user's Preview or Agents queues
  const eligibleJobs = useMemo(() => {
    if (!user) return [];
    const myUid = user.uid;
    const myEmail = user.email || "";
    const { urls, titles, normalizeUrl, normalizeTitle } = myJobIdentifiers;

    return rawJobs.filter((job) => {
      // 1. Exclude if submitted by admin, current user, or matches personal admin identity
      if (isJobFromAdminOrSelf(job, myUid, myEmail)) return false;

      // 2. Exclude if the current user already has this job in their Agents or Preview queues
      const normUrl = normalizeUrl(job.jobUrl);
      if (normUrl && urls.has(normUrl)) return false;

      const normTitle = normalizeTitle(job.jobTitle);
      if (normTitle && titles.has(normTitle)) return false;

      return true;
    });
  }, [rawJobs, user, myJobIdentifiers]);

  // Partition into Active and Archived sets
  const { activeJobs, archivedJobs } = useMemo(() => {
    const active: CandidateAppliedJob[] = [];
    const archived: CandidateAppliedJob[] = [];

    const archiveSet = new Set(archivedKeys);

    for (const job of eligibleJobs) {
      const key = getJobKey(job);
      if (archiveSet.has(job.id) || archiveSet.has(key)) {
        archived.push(job);
      } else {
        active.push(job);
      }
    }

    return { activeJobs: active, archivedJobs: archived };
  }, [eligibleJobs, archivedKeys]);

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
        Authenticating administrator session...
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
          </div>
          <p className="text-xs text-neutral-500">
            Jobs discovered by other candidates that you have not yet applied to. 1-click import to tailor and apply.
          </p>
        </div>

        {/* View mode toggle */}
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

          {viewTab === "archived" && archivedJobs.length > 0 && (
            <button
              type="button"
              onClick={handleRestoreAllArchived}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Restore all archived jobs back to active feed"
            >
              <RotateCcw className="w-3 h-3 text-neutral-400" />
              <span>Restore All</span>
            </button>
          )}
        </div>
      </div>

      {/* Permission Warning banner if RTDB rule blocks bulk reads */}
      {permissionError && rawJobs.length === 0 && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 text-xs text-amber-900 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Live database rules are currently in restrictive mode</p>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              Ensure your Firebase Realtime Database rules permit authenticated reads on{" "}
              <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">/appliedJobs</code> or your admin account.
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
                : "You're all caught up!"}
            </p>
            <p className="text-[11px] text-neutral-500 max-w-sm mx-auto leading-relaxed">
              {searchQuery
                ? "Try searching for a different company name or keyword."
                : viewTab === "archived"
                ? "Jobs you archive from your secret feed will be preserved here so you can restore them anytime."
                : archivedJobs.length > 0 && activeJobs.length === 0
                ? "You have archived every incoming job in the stream."
                : "You have already applied to or queued every job discovered by other candidates on the platform."}
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
                    title="Archive this job from your active secret feed"
                  >
                    <Archive className="w-3 h-3 text-neutral-400" />
                    <span>Archive</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnarchiveJob(job)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Restore job back to your active secret feed"
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
