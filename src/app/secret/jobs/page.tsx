"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  Sliders,
  ShieldAlert,
  Search,
  Briefcase,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, onValue, get } from "firebase/database";
import type { AgentResumeEntry } from "@/lib/resume/agentsQueue";

const AUTHORIZED_ADMIN_EMAILS = [
  "lakshman.r.2008@gmail.com",
  process.env.NEXT_PUBLIC_ADMIN_EMAIL,
]
  .filter(Boolean)
  .map((e) => e!.toLowerCase().trim());

export interface PlatformAppliedJob {
  id: string;
  jobTitle: string;
  jobUrl: string;
  timestamp: string;
  applicantEmail?: string;
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

export default function SecretJobsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [jobs, setJobs] = useState<PlatformAppliedJob[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [permissionError, setPermissionError] = useState(false);

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

  // Fetch all applied jobs across users from RTDB
  useEffect(() => {
    if (!user || !isAuthorized || !isFirebaseConfigured) {
      setDataLoading(false);
      return;
    }

    const jobMap = new Map<string, PlatformAppliedJob>();

    const updateFromSnapshot = (appliedVal: Record<string, any> | null, queuesVal: Record<string, any> | null) => {
      // 1. Ingest from global appliedJobs table
      if (appliedVal && typeof appliedVal === "object") {
        for (const [key, val] of Object.entries(appliedVal)) {
          if (!val || typeof val !== "object") continue;
          const title = val.jobTitle || val.roleName || "Untitled Role";
          const url = val.jobUrl || val.roleUrl || "";
          const time = val.timestamp || val.addedAt || new Date().toISOString();
          const email = val.userEmail || undefined;
          const dedupeKey = `${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`;
          if (!jobMap.has(dedupeKey)) {
            jobMap.set(dedupeKey, {
              id: key,
              jobTitle: title,
              jobUrl: url,
              timestamp: time,
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
            const email = entry.tailoredResume?.contact?.email || undefined;
            const dedupeKey = `${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`;

            if (!jobMap.has(dedupeKey)) {
              jobMap.set(dedupeKey, {
                id: entry.id || dedupeKey,
                jobTitle: title,
                jobUrl: url,
                timestamp: time,
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
      setJobs(list);
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

    // Also attempt one-shot load of agentsQueues to gather all prior jobs
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
  const handleAddToMyOperations = (job: PlatformAppliedJob) => {
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

  // Filter jobs by search query
  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      j.jobTitle.toLowerCase().includes(q) ||
      j.jobUrl.toLowerCase().includes(q) ||
      (j.applicantEmail && j.applicantEmail.toLowerCase().includes(q))
    );
  });

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
            Real-time feed of jobs applied to across the platform. Click to immediately tailor in your workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-neutral-500 bg-white border border-[#ebebeb] px-2.5 py-1 rounded-md shadow-2xs">
            {jobs.length} {jobs.length === 1 ? "job total" : "jobs total"}
          </span>
        </div>
      </div>

      {/* Permission Warning banner if RTDB rule blocks bulk reads */}
      {permissionError && jobs.length === 0 && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 text-xs text-amber-900 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Live database rules are currently in restrictive mode</p>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              If other users have applied, ensure your Firebase Realtime Database rules permit authenticated reads on{" "}
              <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">/appliedJobs</code> or your admin account.
            </p>
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

      {/* Jobs List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#ebebeb] p-8 text-center space-y-2 shadow-2xs">
            <Briefcase className="w-6 h-6 text-neutral-300 mx-auto" />
            <p className="text-xs font-medium text-neutral-800">
              {searchQuery ? "No matching jobs found" : "No applied jobs recorded yet"}
            </p>
            <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
              {searchQuery
                ? "Try searching for a different company or keyword."
                : "Whenever candidates on the platform apply to positions, they will stream here automatically."}
            </p>
          </div>
        ) : (
          filteredJobs.map((job) => (
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

                {job.jobUrl && (
                  <div className="flex items-center gap-1.5">
                    <a
                      href={job.jobUrl.startsWith("http") ? job.jobUrl : `https://${job.jobUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline flex items-center gap-1 transition-colors truncate max-w-md"
                    >
                      <span>{getDomainFromUrl(job.jobUrl)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {job.jobUrl && (
                  <a
                    href={job.jobUrl.startsWith("http") ? job.jobUrl : `https://${job.jobUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Open external job application link"
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
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
