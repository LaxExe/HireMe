"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, Plus, Search, FileText, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loadMasterResume } from "@/lib/resume/store";
import { isEmptyResume } from "@/lib/resume/latex";
import {
  matchJobDescriptionWithResume,
  type KeywordMatchResult,
} from "@/lib/resume/keywordMatch";
import type { MasterResume } from "@/lib/resume/types";

export default function OperationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [resume, setResume] = useState<MasterResume | null>(null);
  const [resumeReady, setResumeReady] = useState(false);

  const [jobDescription, setJobDescription] = useState("");
  const [draftJd, setDraftJd] = useState("");
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [matchResult, setMatchResult] = useState<KeywordMatchResult | null>(null);
  const [missingResumePrompt, setMissingResumePrompt] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const savedJd =
      typeof window !== "undefined"
        ? localStorage.getItem(`hireme_operations_jd_${user.uid}`) || ""
        : "";
    if (savedJd) {
      setJobDescription(savedJd);
      setDraftJd(savedJd);
    }

    loadMasterResume(user.uid).then((loaded) => {
      if (cancelled) return;
      setResume(loaded);
      setResumeReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user || !resumeReady) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  const hasValidResume = Boolean(resume && !isEmptyResume(resume));

  const saveJd = (text: string) => {
    const clean = text.trim();
    setJobDescription(clean);
    if (typeof window !== "undefined") {
      localStorage.setItem(`hireme_operations_jd_${user.uid}`, clean);
    }
    setIsPromptOpen(false);
    setMatchResult(null);
    setMissingResumePrompt(false);
  };

  const handleOpenAddJd = () => {
    setDraftJd(jobDescription);
    setIsPromptOpen(true);
    setMissingResumePrompt(false);
  };

  const handleCheckKeywordMatch = () => {
    const targetJd = isPromptOpen ? draftJd.trim() : jobDescription.trim();
    if (!targetJd) return;

    if (isPromptOpen) {
      setJobDescription(targetJd);
      if (typeof window !== "undefined") {
        localStorage.setItem(`hireme_operations_jd_${user.uid}`, targetJd);
      }
      setIsPromptOpen(false);
    }

    if (!hasValidResume || !resume) {
      setMissingResumePrompt(true);
      setMatchResult(null);
      return;
    }

    setMissingResumePrompt(false);
    const result = matchJobDescriptionWithResume(targetJd, resume);
    setMatchResult(result);
  };

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            operations
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Job description keyword matching against your master resume
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddJd}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Job Description</span>
          </button>

          {(jobDescription.trim() || (isPromptOpen && draftJd.trim())) && (
            <button
              type="button"
              onClick={handleCheckKeywordMatch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Check Keyword Match</span>
            </button>
          )}
        </div>
      </div>

      {/* Missing Resume Prompt Banner */}
      {missingResumePrompt && (
        <div className="bg-white rounded-xl border border-amber-200/80 shadow-subtle p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-scaleIn">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-neutral-900">
                No resume found in Experience
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Upload or paste your LaTeX resume on the Experience page first so we can check which technologies, skills, and tools match this job description.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/experience")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer flex-shrink-0"
          >
            <span>Add Resume</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Paste Job Description Prompt */}
      {isPromptOpen ? (
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-3 animate-scaleIn">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-tight text-neutral-900">
              Paste Job Description
            </h2>
            <span className="text-[11px] font-mono text-neutral-400">
              {draftJd.trim().length} chars
            </span>
          </div>
          <textarea
            value={draftJd}
            autoFocus
            onChange={(e) => setDraftJd(e.target.value)}
            placeholder="Paste the full job description, requirements, and qualifications here..."
            className="w-full h-56 p-3 text-xs leading-relaxed bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors resize-none"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsPromptOpen(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftJd.trim()}
              onClick={() => saveJd(draftJd)}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full disabled:opacity-40 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              Save Description
            </button>
            <button
              type="button"
              disabled={!draftJd.trim()}
              onClick={handleCheckKeywordMatch}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Check Keyword Match</span>
            </button>
          </div>
        </div>
      ) : !jobDescription ? (
        /* Empty State */
        <div className="w-full bg-white rounded-xl border border-[#ebebeb] shadow-subtle min-h-[340px] flex flex-col items-center justify-center p-8 text-center space-y-3">
          <div className="w-9 h-9 rounded-full bg-neutral-100 border border-[#ebebeb] flex items-center justify-center text-neutral-500">
            <FileText className="w-4 h-4" />
          </div>
          <div className="space-y-1 max-w-sm">
            <p className="text-xs font-semibold text-neutral-900">
              No job description loaded
            </p>
            <p className="text-xs text-neutral-500">
              Add a job description to scan for required technologies, skills, and developer tools against your resume.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddJd}
            className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Job Description</span>
          </button>
        </div>
      ) : (
        /* Loaded Job Description + Match Results */
        <div className="space-y-6">
          {/* Active Job Description Card */}
          <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-neutral-900">
                  Job Description
                </span>
                <span className="font-mono text-[10px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                  {jobDescription.length} chars
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddJd}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] rounded-md transition-colors active:scale-95 cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleCheckKeywordMatch}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md shadow-2xs active:scale-95 transition-all cursor-pointer"
                >
                  <Search className="w-3 h-3" />
                  <span>Check Keyword Match</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-neutral-600 line-clamp-3 leading-relaxed bg-[#fafafa] border border-[#ebebeb] rounded-lg p-3 font-sans whitespace-pre-line">
              {jobDescription}
            </p>
          </div>

          {/* Keyword Match Results */}
          {matchResult && (
            <div className="space-y-4 animate-fadeIn">
              {/* Summary Score Bar */}
              <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold font-mono tracking-tight text-neutral-900">
                      {matchResult.scorePercent}%
                    </span>
                    <span className="text-xs font-medium text-neutral-600">
                      Keyword Match
                    </span>
                    <span className="font-mono text-[11px] text-neutral-400">
                      ({matchResult.matchedCount} of {matchResult.totalDetected} technologies & skills on resume)
                    </span>
                  </div>

                  {resume?.contact.name && (
                    <span className="font-mono text-[11px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2.5 py-1 rounded-full">
                      Resume: {resume.contact.name}
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden border border-[#ebebeb]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      matchResult.scorePercent >= 75
                        ? "bg-emerald-500"
                        : matchResult.scorePercent >= 45
                        ? "bg-amber-400"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${matchResult.scorePercent}%` }}
                  />
                </div>
              </div>

              {matchResult.totalDetected === 0 ? (
                <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-6 text-center">
                  <p className="text-xs text-neutral-500 font-mono">
                    No technical skills or tools were detected in this job description.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Matched Skills & Tools */}
                  <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#ebebeb] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <h3 className="text-xs font-semibold text-neutral-900">
                          Matched on Resume
                        </h3>
                      </div>
                      <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {matchResult.matchedCount}
                      </span>
                    </div>

                    {matchResult.matched.length === 0 ? (
                      <p className="text-xs text-neutral-400 font-mono py-4 text-center">
                        none matched
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {matchResult.matched.map((item) => (
                          <div
                            key={item.name}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/60 border border-emerald-200/80 text-xs text-neutral-900"
                          >
                            <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span className="font-medium">{item.name}</span>
                            <span className="font-mono text-[10px] text-neutral-400">
                              {item.foundIn
                                .map((loc) =>
                                  loc === "skills"
                                    ? "skills"
                                    : loc === "experience"
                                    ? "exp"
                                    : "proj"
                                )
                                .join("·")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Missing Skills & Tools */}
                  <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#ebebeb] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <h3 className="text-xs font-semibold text-neutral-900">
                          Missing from Resume
                        </h3>
                      </div>
                      <span className="font-mono text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        {matchResult.missingCount}
                      </span>
                    </div>

                    {matchResult.missing.length === 0 ? (
                      <p className="text-xs text-emerald-600 font-mono py-4 text-center">
                        all detected skills & tools are on your resume
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {matchResult.missing.map((item) => (
                          <div
                            key={item.name}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50/60 border border-amber-200/80 text-xs text-neutral-900"
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="font-mono text-[10px] text-neutral-400">
                              {item.category === "Frameworks & Libraries"
                                ? "framework"
                                : item.category === "Databases & Cloud"
                                ? "db/cloud"
                                : item.category === "Tools & Infrastructure"
                                ? "tool"
                                : item.category === "Languages"
                                ? "lang"
                                : "core"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
