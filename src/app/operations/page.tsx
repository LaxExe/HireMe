"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  AlertCircle,
  Plus,
  Search,
  FileText,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Download,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loadMasterResume, saveMasterResume } from "@/lib/resume/store";
import { isEmptyResume } from "@/lib/resume/latex";
import {
  matchJobDescriptionWithResume,
  type KeywordMatchResult,
} from "@/lib/resume/keywordMatch";
import {
  runLarpAlignmentPipeline,
  applyLarpMutationsToResume,
  PYLON_TEST_JD,
  type LarpAlignmentRun,
} from "@/lib/resume/larpEngine";
import { downloadResumePdf } from "@/lib/resume/exportPdf";
import { parseMarkup } from "@/lib/resume/utils";
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
  const [larpRun, setLarpRun] = useState<LarpAlignmentRun | null>(null);
  const [acceptedBullets, setAcceptedBullets] = useState<Set<string>>(new Set());
  const [applySkillsSwap, setApplySkillsSwap] = useState(true);
  const [appliedBanner, setAppliedBanner] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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
    setLarpRun(null);
    setAppliedBanner(false);
    setMissingResumePrompt(false);
  };

  const handleOpenAddJd = () => {
    setDraftJd(jobDescription);
    setIsPromptOpen(true);
    setMissingResumePrompt(false);
  };

  const executeAnalysisAndLarp = (targetJd: string, currentResume: MasterResume) => {
    const kwResult = matchJobDescriptionWithResume(targetJd, currentResume);
    const alignment = runLarpAlignmentPipeline(targetJd, currentResume);
    setMatchResult(kwResult);
    setLarpRun(alignment);
    setAcceptedBullets(new Set(alignment.bulletProposals.map((p) => p.bulletId)));
    setApplySkillsSwap(true);
    setAppliedBanner(false);
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
      setLarpRun(null);
      return;
    }

    setMissingResumePrompt(false);
    executeAnalysisAndLarp(targetJd, resume);
  };

  const handleToggleBullet = (bulletId: string) => {
    setAcceptedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(bulletId)) next.delete(bulletId);
      else next.add(bulletId);
      return next;
    });
    setAppliedBanner(false);
  };

  const handleApplyToMasterResume = async () => {
    if (!resume || !larpRun) return;
    const updated = applyLarpMutationsToResume(
      resume,
      larpRun,
      acceptedBullets,
      applySkillsSwap
    );
    setResume(updated);
    await saveMasterResume(user.uid, updated);
    // Re-score keyword match against updated resume
    setMatchResult(matchJobDescriptionWithResume(jobDescription, updated));
    setAppliedBanner(true);
  };

  const handleExportTailoredPdf = async () => {
    if (!resume || !larpRun || exportingPdf) return;
    const tailored = applyLarpMutationsToResume(
      resume,
      larpRun,
      acceptedBullets,
      applySkillsSwap
    );
    const defaultName = tailored.contact.name
      ? `${tailored.contact.name.trim().replace(/\s+/g, "_")}_Aligned_Resume`
      : "Aligned_Resume";
    setExportingPdf(true);
    try {
      await downloadResumePdf(tailored, defaultName);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            operations
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Defensible Resume Alignment (LARP) & keyword matching engine
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xs font-semibold tracking-tight text-neutral-900">
              Paste Job Description
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftJd(PYLON_TEST_JD)}
                className="text-[11px] font-mono text-neutral-500 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2 py-0.5 rounded transition-colors active:scale-95 cursor-pointer"
              >
                Load Pylon Test JD
              </button>
              <span className="text-[11px] font-mono text-neutral-400">
                {draftJd.trim().length} chars
              </span>
            </div>
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
              Add a job description to classify skills across the 4-Tier Defensibility Spec and align your resume bullets without overflowing LaTeX lines.
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
        /* Loaded Job Description + Match Results + LARP Alignment Engine */
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

          {/* Keyword Match & LARP Results */}
          {matchResult && larpRun && (
            <div className="space-y-6 animate-fadeIn">
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

                  <div className="flex items-center gap-2">
                    {larpRun.guardrailVerifiedZeroBanned && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        <Check className="w-3 h-3" />
                        <span>Tier-2 Banned Guardrail: 0 Injected</span>
                      </span>
                    )}
                    {resume?.contact.name && (
                      <span className="font-mono text-[11px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2.5 py-1 rounded-full">
                        {resume.contact.name}
                      </span>
                    )}
                  </div>
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

              {/* Step 1: 4-Tier Defensibility Classification Spec */}
              <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#ebebeb] pb-3">
                  <div>
                    <h2 className="text-xs font-semibold text-neutral-900">
                      Step 1 · 4-Tier Defensibility Classification
                    </h2>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Extracted JD keywords bucketed by live-interview defensibility
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2 py-0.5 rounded">
                    Cap: ≤ Tier 1 in Bullets
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* MATCHED */}
                  <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-emerald-700 uppercase">
                        Matched
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {larpRun.tiers.matched.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {larpRun.tiers.matched.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {larpRun.tiers.matched.length === 0 && (
                        <span className="text-[11px] font-mono text-neutral-400">none</span>
                      )}
                    </div>
                  </div>

                  {/* TIER 0: WORKFLOW */}
                  <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-blue-700 uppercase">
                        Tier 0 · Workflow
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {larpRun.tiers.tier_0_workflow.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {larpRun.tiers.tier_0_workflow.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* TIER 1: FRAMING & WRAPPERS */}
                  <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-indigo-700 uppercase">
                        Tier 1 · Framing
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {larpRun.tiers.tier_1_framing.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {larpRun.tiers.tier_1_framing.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {larpRun.tiers.tier_1_framing.length === 0 && (
                        <span className="text-[11px] font-mono text-neutral-400">none</span>
                      )}
                    </div>
                  </div>

                  {/* TIER 1.5: SKILLS ONLY */}
                  <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-violet-700 uppercase">
                        Tier 1.5 · Skills Only
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {larpRun.tiers.tier_1_5_skills_only.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {larpRun.tiers.tier_1_5_skills_only.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {larpRun.tiers.tier_1_5_skills_only.length === 0 && (
                        <span className="text-[11px] font-mono text-neutral-400">none</span>
                      )}
                    </div>
                  </div>

                  {/* TIER 2: BANNED */}
                  <div className="rounded-lg border border-red-200/70 bg-red-50/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-red-700 uppercase">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Tier 2 · Banned</span>
                      </span>
                      <span className="font-mono text-[10px] text-red-500">
                        {larpRun.tiers.tier_2_banned.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {larpRun.tiers.tier_2_banned.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-red-100/80 border border-red-200 text-red-800 font-medium line-through"
                        >
                          {k}
                        </span>
                      ))}
                      {larpRun.tiers.tier_2_banned.length === 0 && (
                        <span className="text-[11px] font-mono text-neutral-400">none</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Skills Section Smart-Swapper */}
              <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#ebebeb] pb-3 gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xs font-semibold text-neutral-900">
                      Step 2 · Skills Section Smart-Swapper
                    </h2>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Appends or swaps Tier 1.5 plug-and-play tools while keeping every category line ≤ 98.0 NCU (single line)
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applySkillsSwap}
                      onChange={(e) => {
                        setApplySkillsSwap(e.target.checked);
                        setAppliedBanner(false);
                      }}
                      className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                    />
                    <span>Include Skills Section mutations</span>
                  </label>
                </div>

                {larpRun.skillSwaps.length === 0 ? (
                  <p className="text-xs font-mono text-neutral-400 py-3 text-center">
                    No additional Tier 1.5 skills needed or all matching skills are already present.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {larpRun.skillSwaps.map((swap) => (
                      <div
                        key={swap.categoryId}
                        className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-neutral-900 mr-1">
                            {swap.categoryName}:
                          </span>
                          {swap.added.map((s) => (
                            <span
                              key={`add-${s}`}
                              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700"
                            >
                              +{s}
                            </span>
                          ))}
                          {swap.swappedOut.map((s) => (
                            <span
                              key={`rem-${s}`}
                              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 line-through"
                            >
                              -{s}
                            </span>
                          ))}
                        </div>
                        <span className="font-mono text-[10px] text-neutral-500 bg-white border border-[#ebebeb] px-2 py-0.5 rounded flex-shrink-0">
                          {swap.origNcu} → {swap.newNcu} / 98.0 NCU (1L)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 3: Centralized, Context-Aware Minimal Bullet Placement */}
              <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#ebebeb] pb-3 gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xs font-semibold text-neutral-900">
                      Step 3 · Centralized Minimal Bullet Additions
                    </h2>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Automatically picks 1 context-matched bullet with free line space per technical tool (no PM jargon, ≤ 1–5 words added)
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2 py-0.5 rounded">
                    {acceptedBullets.size} of {larpRun.bulletProposals.length} selected
                  </span>
                </div>

                {larpRun.bulletProposals.length === 0 ? (
                  <p className="text-xs font-mono text-neutral-400 py-4 text-center">
                    All experience and project bullets already contain the compatible technical tools or have no remaining line slack.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {larpRun.bulletProposals.map((prop) => {
                      const isSelected = acceptedBullets.has(prop.bulletId);
                      return (
                        <div
                          key={prop.bulletId}
                          className={`rounded-xl border p-4 space-y-3 transition-colors ${
                            isSelected
                              ? "border-neutral-900 bg-white"
                              : "border-[#ebebeb] bg-[#fafafa] opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleBullet(prop.bulletId)}
                                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                                />
                                <span className="text-xs font-semibold text-neutral-900">
                                  {prop.containerTitle}
                                </span>
                              </label>
                              <span className="font-mono text-[10px] text-neutral-500 bg-neutral-100 border border-[#ebebeb] px-1.5 py-0.5 rounded">
                                {prop.contextCategory}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {prop.injectedKeywords.map((kw) => (
                                <span
                                  key={kw}
                                  className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700"
                                >
                                  +{kw} (1 spot only)
                                </span>
                              ))}
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                                +{prop.wordStats.reframedWords} words added
                              </span>
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-100 border border-[#ebebeb] text-neutral-600">
                                {prop.budget.origWidth} → {prop.budget.candWidth} NCU (
                                {prop.budget.origLines}L → {prop.budget.candLines}L ·{" "}
                                {prop.budget.slackNcu} NCU slack had room)
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] text-neutral-500 font-mono">
                            Why this spot: {prop.reason}
                          </p>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs leading-relaxed">
                            <div className="rounded-lg bg-[#fafafa] border border-[#ebebeb] p-3">
                              <span className="block font-mono text-[10px] text-neutral-400 uppercase mb-1">
                                Original ({prop.budget.origWidth} NCU · {prop.budget.origLines}L)
                              </span>
                              <p className="text-neutral-600">
                                {parseMarkup(prop.originalMarkup).map((seg, idx) =>
                                  seg.bold ? (
                                    <strong key={idx} className="font-semibold text-neutral-900">
                                      {seg.text}
                                    </strong>
                                  ) : (
                                    <span key={idx}>{seg.text}</span>
                                  )
                                )}
                              </p>
                            </div>

                            <div className="rounded-lg bg-emerald-50/30 border border-emerald-200/70 p-3">
                              <span className="block font-mono text-[10px] text-emerald-700 uppercase mb-1">
                                Aligned ({prop.budget.candWidth} NCU · {prop.budget.candLines}L)
                              </span>
                              <p className="text-neutral-800">
                                {prop.wordStats.tokens.map((tok, idx) => {
                                  const clean = tok.word.replace(/\*\*/g, "");
                                  const isBold = tok.word.includes("**");
                                  return (
                                    <React.Fragment key={idx}>
                                      {idx > 0 && " "}
                                      <span
                                        className={
                                          tok.changed
                                            ? "bg-emerald-100/90 text-emerald-950 px-1 py-0.5 rounded font-medium"
                                            : ""
                                        }
                                      >
                                        {isBold ? (
                                          <strong className="font-semibold text-neutral-900">
                                            {clean}
                                          </strong>
                                        ) : (
                                          clean
                                        )}
                                      </span>
                                    </React.Fragment>
                                  );
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Apply & Export Bar */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#ebebeb] flex-wrap">
                  <div>
                    {appliedBanner && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                        <span>Applied to your Master Resume in Experience!</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApplyToMasterResume}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-800 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Apply to Master Resume</span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingPdf}
                      onClick={handleExportTailoredPdf}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {exportingPdf ? "Compiling Tailored PDF..." : "Export Tailored PDF"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
