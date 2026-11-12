"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  archiveAgentEntry,
  deleteAgentEntry,
  loadAgentsQueue,
  loadAgentsQueueAsync,
  toggleAgentSentStatus,
  unarchiveAgentEntry,
  type AgentResumeEntry,
} from "@/lib/resume/agentsQueue";
import { downloadResumePdf } from "@/lib/resume/exportPdf";

function safeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function AgentsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [entries, setEntries] = useState<AgentResumeEntry[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const syncLoaded = loadAgentsQueue(user.uid);
    if (syncLoaded.length > 0) {
      setEntries(syncLoaded);
    }
    loadAgentsQueueAsync(user.uid).then((asyncLoaded) => {
      if (!cancelled) {
        setEntries(asyncLoaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  const activeEntries = entries.filter((e) => !e.archived);
  const archivedEntries = entries.filter((e) => e.archived);

  const handleDownloadEntry = async (entry: AgentResumeEntry) => {
    if (downloadingId) return;
    setDownloadingId(entry.id);
    try {
      const baseName = entry.fileName.replace(/\.pdf$/i, "");
      await downloadResumePdf(entry.tailoredResume, baseName);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleToggleSent = (entryId: string) => {
    setEntries(toggleAgentSentStatus(user.uid, entryId));
  };

  const handleArchive = (entryId: string) => {
    setEntries(archiveAgentEntry(user.uid, entryId));
  };

  const handleRestore = (entryId: string) => {
    setEntries(unarchiveAgentEntry(user.uid, entryId));
  };

  const handleDelete = (entryId: string) => {
    setEntries(deleteAgentEntry(user.uid, entryId));
  };

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            agents
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Tailored resumes pushed for submission tracking and archiving
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-neutral-500 bg-white border border-[#ebebeb] px-3 py-1 rounded-full">
            {activeEntries.length} active · {archivedEntries.length} archived
          </span>
          <button
            type="button"
            onClick={() => router.push("/preview")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <span>Preview</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="w-full bg-white rounded-xl border border-[#ebebeb] shadow-subtle min-h-[320px] flex flex-col items-center justify-center p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-[#ebebeb] flex items-center justify-center text-neutral-500">
            <FileText className="w-4 h-4" />
          </div>
          <div className="space-y-1 max-w-md">
            <h2 className="text-sm font-semibold text-neutral-900">
              No resumes pushed to agents yet
            </h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Select your skills and edits in Preview, then click{" "}
              <span className="font-mono text-neutral-800">Push to Agents</span> to queue the
              file for submission here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/preview")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
          >
            <span>Go to Preview</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Pushed Resumes */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                Active Queue ({activeEntries.length})
              </span>
            </div>

            {activeEntries.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#ebebeb] p-6 text-center text-xs font-mono text-neutral-400">
                All pushed resumes are archived below.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeEntries.map((entry) => {
                  const href = safeExternalUrl(entry.roleUrl);
                  return (
                    <div
                      key={entry.id}
                      className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="text-sm font-semibold text-neutral-900">
                            {entry.roleName}
                          </h2>
                          <span
                            className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-0.5 rounded-full border ${
                              entry.sentToCompany
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-neutral-100 text-neutral-600 border-[#ebebeb]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                entry.sentToCompany ? "bg-emerald-600" : "bg-neutral-400"
                              }`}
                            />
                            <span>{entry.sentToCompany ? "Sent to Company" : "Not Sent"}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            disabled={downloadingId === entry.id}
                            onClick={() => handleDownloadEntry(entry)}
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2.5 py-1 rounded-md active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                          >
                            <Download className="w-3 h-3 text-neutral-600" />
                            <span className="underline decoration-neutral-300 underline-offset-2">
                              {downloadingId === entry.id ? "Generating PDF..." : entry.fileName}
                            </span>
                          </button>

                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-600 hover:text-neutral-900 underline decoration-[#ebebeb] underline-offset-2 max-w-xs truncate"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">{entry.roleUrl}</span>
                            </a>
                          ) : (
                            <span className="font-mono text-[11px] text-neutral-400">
                              No link provided
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={entry.sentToCompany}
                          onClick={() => handleToggleSent(entry.id)}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border active:scale-95 transition-all cursor-pointer ${
                            entry.sentToCompany
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-[#ebebeb] hover:bg-neutral-50"
                          }`}
                        >
                          <span
                            className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                              entry.sentToCompany ? "bg-emerald-500" : "bg-neutral-300"
                            }`}
                          >
                            <span
                              className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                                entry.sentToCompany ? "translate-x-3" : "translate-x-0.5"
                              }`}
                            />
                          </span>
                          <span>Sent to Company</span>
                        </button>

                        <button
                          type="button"
                          disabled={!entry.sentToCompany}
                          onClick={() => handleArchive(entry.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                            entry.sentToCompany
                              ? "bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-900 hover:text-white active:scale-95 cursor-pointer shadow-2xs"
                              : "bg-[#fafafa] text-neutral-400 border-[#ebebeb] opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>Archive</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          aria-label={`Delete ${entry.roleName}`}
                          className="p-1.5 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Archive Section */}
          <section className="space-y-3 pt-4 border-t border-[#ebebeb]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                Archive ({archivedEntries.length})
              </span>
            </div>

            {archivedEntries.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#ebebeb] p-6 text-center text-xs font-mono text-neutral-400">
                No archived resumes yet.
              </div>
            ) : (
              <div className="space-y-2">
                {archivedEntries.map((entry) => {
                  const href = safeExternalUrl(entry.roleUrl);
                  return (
                    <div
                      key={entry.id}
                      className="bg-[#fafafa] rounded-xl border border-[#ebebeb] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-neutral-800">
                            {entry.roleName}
                          </span>
                          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            <span>Sent · Archived</span>
                          </span>
                          {entry.archivedAt && (
                            <span className="font-mono text-[10px] text-neutral-400">
                              {new Date(entry.archivedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            disabled={downloadingId === entry.id}
                            onClick={() => handleDownloadEntry(entry)}
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-700 hover:text-neutral-900 bg-white border border-[#ebebeb] px-2.5 py-0.5 rounded-md active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                          >
                            <Download className="w-3 h-3 text-neutral-500" />
                            <span className="underline decoration-neutral-300 underline-offset-2">
                              {downloadingId === entry.id ? "Generating PDF..." : entry.fileName}
                            </span>
                          </button>

                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-500 hover:text-neutral-900 underline decoration-[#ebebeb] underline-offset-2 max-w-xs truncate"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">{entry.roleUrl}</span>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestore(entry.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-[#ebebeb] rounded-full active:scale-95 transition-all cursor-pointer"
                        >
                          <ArchiveRestore className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          aria-label={`Delete archived ${entry.roleName}`}
                          className="p-1.5 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
