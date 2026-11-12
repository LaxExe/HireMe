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
  Pencil,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loadMasterResume } from "@/lib/resume/store";
import { isEmptyResume } from "@/lib/resume/latex";
import {
  matchJobDescriptionWithResume,
  type KeywordMatchResult,
} from "@/lib/resume/keywordMatch";
import {
  runLarpAlignmentPipeline,
  evaluateBelievabilityAndRecommend,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
  PYLON_TEST_JD,
  type LarpAlignmentRun,
} from "@/lib/resume/larpEngine";
import { enqueuePreviewItem, loadPreviewQueue } from "@/lib/resume/previewQueue";
import { parseMarkup } from "@/lib/resume/utils";
import type { MasterResume } from "@/lib/resume/types";

export default function OperationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [resume, setResume] = useState<MasterResume | null>(null);
  const [resumeReady, setResumeReady] = useState(false);

  const [roleName, setRoleName] = useState("");
  const [roleUrl, setRoleUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [draftRoleName, setDraftRoleName] = useState("");
  const [draftRoleUrl, setDraftRoleUrl] = useState("");
  const [draftJd, setDraftJd] = useState("");
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const [matchResult, setMatchResult] = useState<KeywordMatchResult | null>(null);
  const [larpRun, setLarpRun] = useState<LarpAlignmentRun | null>(null);
  const [acceptedBullets, setAcceptedBullets] = useState<Set<string>>(new Set());
  const [acceptedMalleable, setAcceptedMalleable] = useState<Set<string>>(new Set());
  const [selectedMalleableOption, setSelectedMalleableOption] = useState<Record<string, string>>(
    {}
  );
  const [editingBulletId, setEditingBulletId] = useState<string | null>(null);
  const [editingMalleableOptId, setEditingMalleableOptId] = useState<string | null>(null);
  const [applySkillsSwap, setApplySkillsSwap] = useState(true);
  const [queuedSlotBanner, setQueuedSlotBanner] = useState<{
    count: number;
    latestTitle: string;
  } | null>(null);
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
    const savedRoleName =
      typeof window !== "undefined"
        ? localStorage.getItem(`hireme_operations_role_name_${user.uid}`) || ""
        : "";
    const savedRoleUrl =
      typeof window !== "undefined"
        ? localStorage.getItem(`hireme_operations_role_url_${user.uid}`) || ""
        : "";
    if (savedJd) {
      setJobDescription(savedJd);
      setDraftJd(savedJd);
    }
    if (savedRoleName) {
      setRoleName(savedRoleName);
      setDraftRoleName(savedRoleName);
    }
    if (savedRoleUrl) {
      setRoleUrl(savedRoleUrl);
      setDraftRoleUrl(savedRoleUrl);
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

  const saveJd = (text: string, nextRoleName = draftRoleName, nextRoleUrl = draftRoleUrl) => {
    const clean = text.trim();
    const cleanRole = nextRoleName.trim();
    const cleanUrl = nextRoleUrl.trim();
    setJobDescription(clean);
    setRoleName(cleanRole);
    setRoleUrl(cleanUrl);
    if (typeof window !== "undefined") {
      localStorage.setItem(`hireme_operations_jd_${user.uid}`, clean);
      localStorage.setItem(`hireme_operations_role_name_${user.uid}`, cleanRole);
      localStorage.setItem(`hireme_operations_role_url_${user.uid}`, cleanUrl);
    }
    setIsPromptOpen(false);
    setMatchResult(null);
    setLarpRun(null);
    setMissingResumePrompt(false);
  };

  const handleOpenAddJd = () => {
    setDraftJd(jobDescription);
    setDraftRoleName(roleName);
    setDraftRoleUrl(roleUrl);
    setIsPromptOpen(true);
    setMissingResumePrompt(false);
  };

  const executeAnalysisAndLarp = (targetJd: string, currentResume: MasterResume) => {
    const kwResult = matchJobDescriptionWithResume(targetJd, currentResume);
    const alignment = runLarpAlignmentPipeline(targetJd, currentResume);
    setMatchResult(kwResult);
    setLarpRun(alignment);
    setAcceptedBullets(new Set(alignment.bulletProposals.map((p) => p.bulletId)));
    setAcceptedMalleable(
      new Set(alignment.malleableBullets.filter((m) => m.recommended).map((m) => m.id))
    );
    const initialOptMap: Record<string, string> = {};
    for (const mb of alignment.malleableBullets) {
      if (mb.options && mb.options.length > 0) {
        initialOptMap[mb.id] = mb.options[0].id;
      }
    }
    setSelectedMalleableOption(initialOptMap);
    setEditingBulletId(null);
    setEditingMalleableOptId(null);
    setApplySkillsSwap(true);
    setQueuedSlotBanner(null);
  };

  const handleCheckKeywordMatch = () => {
    const targetJd = isPromptOpen ? draftJd.trim() : jobDescription.trim();
    if (!targetJd) return;

    if (isPromptOpen) {
      const cleanRole = draftRoleName.trim();
      const cleanUrl = draftRoleUrl.trim();
      setJobDescription(targetJd);
      setRoleName(cleanRole);
      setRoleUrl(cleanUrl);
      if (typeof window !== "undefined") {
        localStorage.setItem(`hireme_operations_jd_${user.uid}`, targetJd);
        localStorage.setItem(`hireme_operations_role_name_${user.uid}`, cleanRole);
        localStorage.setItem(`hireme_operations_role_url_${user.uid}`, cleanUrl);
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
  };

  const handleToggleMalleable = (malleableId: string) => {
    setAcceptedMalleable((prev) => {
      const next = new Set(prev);
      if (next.has(malleableId)) next.delete(malleableId);
      else next.add(malleableId);
      return next;
    });
  };

  const handleCustomBulletProposalTextChange = (bulletId: string, newMarkup: string) => {
    setLarpRun((prev) => {
      if (!prev) return prev;
      const nextProposals = prev.bulletProposals.map((bp) =>
        bp.bulletId === bulletId
          ? updateBulletProposalWithCustomMarkup(bp, newMarkup, resume?.calibration)
          : bp
      );
      return {
        ...prev,
        bulletProposals: nextProposals,
        aiRecommendation: evaluateBelievabilityAndRecommend(
          prev.malleableBullets,
          nextProposals
        ),
      };
    });
  };

  const handleCustomMalleableOptionTextChange = (
    slotId: string,
    optionId: string,
    newMarkup: string
  ) => {
    setLarpRun((prev) => {
      if (!prev) return prev;
      const nextMalleable = prev.malleableBullets.map((mb) =>
        mb.id === slotId
          ? updateMalleableOptionWithCustomMarkup(mb, optionId, newMarkup, resume?.calibration)
          : mb
      );
      return {
        ...prev,
        malleableBullets: nextMalleable,
        aiRecommendation: evaluateBelievabilityAndRecommend(
          nextMalleable,
          prev.bulletProposals
        ),
      };
    });
  };

  const handleSelectOnlyTopRecommended = () => {
    if (!larpRun?.aiRecommendation) return;
    const topId = larpRun.aiRecommendation.topPickId;
    if (larpRun.aiRecommendation.topPickKind === "malleable-new-line") {
      setAcceptedMalleable(new Set([topId]));
      setAcceptedBullets(new Set());
    } else {
      setAcceptedMalleable(new Set());
      setAcceptedBullets(new Set([topId]));
    }
  };

  const handleQueueIntoPreviewSlot = () => {
    if (!resume || !larpRun) return;
    const item = enqueuePreviewItem(user.uid, {
      roleName,
      roleUrl,
      jobDescription,
      baseResume: resume,
      larpRun,
      acceptedBulletIds: Array.from(acceptedBullets),
      acceptedMalleableIds: Array.from(acceptedMalleable),
      selectedMalleableOptionBySlotId: selectedMalleableOption,
      applySkillsSwap,
      selectedSkillNames: applySkillsSwap
        ? larpRun.skillSwaps.flatMap((s) => s.added)
        : [],
    });
    const totalCount = loadPreviewQueue(user.uid).length;
    setQueuedSlotBanner({ count: totalCount, latestTitle: item.title });
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

      {/* Paste Job Description + Role Name & URL Prompt */}
      {isPromptOpen ? (
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-3.5 animate-scaleIn">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xs font-semibold tracking-tight text-neutral-900">
              Add Role & Job Description
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftRoleName("Pylon — Software Engineer (Full-Stack)");
                  setDraftRoleUrl("https://usepylon.com/careers");
                  setDraftJd(PYLON_TEST_JD);
                }}
                className="text-[11px] font-mono text-neutral-500 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2 py-0.5 rounded transition-colors active:scale-95 cursor-pointer"
              >
                Load Pylon Test JD
              </button>
              <span className="text-[11px] font-mono text-neutral-400">
                {draftJd.trim().length} chars
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-mono uppercase text-neutral-500">
                Role Name / Company
              </label>
              <input
                type="text"
                value={draftRoleName}
                onChange={(e) => setDraftRoleName(e.target.value)}
                placeholder="e.g. Pylon — Full-Stack Software Engineer"
                className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-mono uppercase text-neutral-500">
                Role Posting URL
              </label>
              <input
                type="url"
                value={draftRoleUrl}
                onChange={(e) => setDraftRoleUrl(e.target.value)}
                placeholder="https://company.com/careers/job-id"
                className="w-full px-3 py-2 text-xs font-mono bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-mono uppercase text-neutral-500">
              Job Description
            </label>
            <textarea
              value={draftJd}
              autoFocus
              onChange={(e) => setDraftJd(e.target.value)}
              placeholder="Paste the full job description, requirements, and qualifications here..."
              className="w-full h-52 p-3 text-xs leading-relaxed bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors resize-none"
            />
          </div>

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
              onClick={() => saveJd(draftJd, draftRoleName, draftRoleUrl)}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full disabled:opacity-40 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              Save Details
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
              Add a role name, URL, and job description to classify skills across the 4-Tier Defensibility Spec and align your resume bullets.
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
          {/* Active Job Description + Inline Role Name & URL Card */}
          <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-xs font-semibold text-neutral-900">
                  {roleName || "Target Role & Job Description"}
                </span>
                {roleUrl && (
                  <a
                    href={roleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-600 hover:text-neutral-900 underline decoration-[#ebebeb] underline-offset-2"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate max-w-[240px]">{roleUrl}</span>
                  </a>
                )}
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
                  Edit Role & JD
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-center gap-2 bg-[#fafafa] border border-[#ebebeb] rounded-lg px-2.5 py-1.5">
                <span className="font-mono text-[10px] uppercase text-neutral-400 flex-shrink-0">
                  Role Name:
                </span>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRoleName(v);
                    if (typeof window !== "undefined") {
                      localStorage.setItem(`hireme_operations_role_name_${user.uid}`, v);
                    }
                  }}
                  placeholder="Enter role title & company (e.g. Pylon — SWE)..."
                  className="w-full text-xs text-neutral-900 bg-transparent focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-[#fafafa] border border-[#ebebeb] rounded-lg px-2.5 py-1.5">
                <span className="font-mono text-[10px] uppercase text-neutral-400 flex-shrink-0">
                  Role URL:
                </span>
                <input
                  type="url"
                  value={roleUrl}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRoleUrl(v);
                    if (typeof window !== "undefined") {
                      localStorage.setItem(`hireme_operations_role_url_${user.uid}`, v);
                    }
                  }}
                  placeholder="https://company.com/careers/..."
                  className="w-full text-xs font-mono text-neutral-900 bg-transparent focus:outline-none"
                />
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
                      Automatically picks 1 context-matched bullet with free line space per tool or PM workflow term (≤ 1–5 words added)
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
                                {prop.budget.candFit.badge} · {prop.budget.candFit.label} ({prop.budget.candChars}/
                                {prop.budget.candLines === 1
                                  ? resume?.calibration?.oneLineMax ?? 108
                                  : resume?.calibration?.twoLineMax ?? 216}{" "}
                                chars)
                              </span>
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-100 border border-[#ebebeb] text-neutral-600">
                                {prop.budget.origChars} → {prop.budget.candChars} chars · {prop.budget.origWidth} →{" "}
                                {prop.budget.candWidth} NCU
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] text-neutral-500 font-mono">
                            Why this spot: {prop.reason}
                          </p>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs leading-relaxed">
                            <div className="rounded-lg bg-[#fafafa] border border-[#ebebeb] p-3">
                              <span className="block font-mono text-[10px] text-neutral-400 uppercase mb-1">
                                Original ({prop.budget.origChars} chars · {prop.budget.origFit.badge} · {prop.budget.origWidth} NCU)
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

                            <div
                              onClick={() => setEditingBulletId(prop.bulletId)}
                              className="rounded-lg bg-emerald-50/30 border border-emerald-200/70 hover:border-emerald-400 p-3 cursor-text transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="block font-mono text-[10px] text-emerald-700 uppercase">
                                  Rewritten to Fit {prop.budget.candFit.badge} Area ({prop.budget.candChars}/
                                  {prop.budget.candLines === 1
                                    ? resume?.calibration?.oneLineMax ?? 108
                                    : resume?.calibration?.twoLineMax ?? 216}{" "}
                                  chars · {prop.budget.candWidth} NCU)
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingBulletId(
                                      editingBulletId === prop.bulletId ? null : prop.bulletId
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-800 hover:text-neutral-900 bg-white/80 border border-emerald-200 px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                  <span>{editingBulletId === prop.bulletId ? "Done" : "Edit"}</span>
                                </button>
                              </div>

                              {editingBulletId === prop.bulletId ? (
                                <textarea
                                  autoFocus
                                  rows={2}
                                  value={prop.mutatedMarkup}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    handleCustomBulletProposalTextChange(prop.bulletId, e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditingBulletId(null);
                                  }}
                                  className="w-full text-xs font-mono text-neutral-900 bg-white border border-emerald-400 rounded-md p-2 focus:outline-none resize-none"
                                />
                              ) : (
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
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Step 4: Malleable 1-Line LARP Bullets (Context-Aware Synthesis) */}
                <div className="border-t border-[#ebebeb] pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-900">
                        Step 4 · Malleable 1-Line LARP Bullets (
                        {resume?.calibration?.malleableLines ?? 1} configured in Experience)
                      </h3>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Synthesizes up to {resume?.calibration?.malleableLines ?? 1} complete 1-line
                        bullet(s) for the single role or project where the stack belongs best
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2 py-0.5 rounded">
                      {acceptedMalleable.size} of {larpRun.malleableBullets.length} malleable line(s)
                      selected
                    </span>
                  </div>

                  {larpRun.malleableBullets.length === 0 ? (
                    <p className="text-xs font-mono text-neutral-400 py-2">
                      Malleable lines set to 0 in Experience calibration (set to 1+ on Experience to
                      generate new 1-line LARP bullets).
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {larpRun.malleableBullets.map((mb) => {
                        const isSelected = acceptedMalleable.has(mb.id);
                        const isTopPick = larpRun.aiRecommendation?.topPickId === mb.id;
                        const activeOptId =
                          selectedMalleableOption[mb.id] || mb.options?.[0]?.id;
                        const activeOpt =
                          mb.options?.find((o) => o.id === activeOptId) || mb.options?.[0];
                        return (
                          <div
                            key={mb.id}
                            className={`rounded-xl border p-4 space-y-3 transition-colors ${
                              isSelected
                                ? "border-neutral-900 bg-white"
                                : "border-[#ebebeb] bg-[#fafafa] opacity-75"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleMalleable(mb.id)}
                                    className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                                  />
                                  <span className="text-xs font-semibold text-neutral-900">
                                    Placement Target: {mb.targetContainerTitle}
                                  </span>
                                </label>
                                {isTopPick && (
                                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 text-white">
                                    AI Recommended · Most Believable ({mb.believabilityScore}%)
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {mb.injectedKeywords.map((kw) => (
                                  <span
                                    key={kw}
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700"
                                  >
                                    +{kw}
                                  </span>
                                ))}
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                                  {(activeOpt?.fit ?? mb.fit).badge} · {(activeOpt?.fit ?? mb.fit).label} (
                                  {activeOpt?.chars ?? mb.chars}/{mb.maxChars} chars ·{" "}
                                  {activeOpt?.widthNcu ?? mb.widthNcu} NCU)
                                </span>
                              </div>
                            </div>

                            {/* Multiple Good, Low-Stretch Resume Point Options */}
                            {mb.options && mb.options.length > 0 && (
                              <div className="space-y-2">
                                <span className="block font-mono text-[10px] text-neutral-400 uppercase">
                                  Choose Phrasing Option ({mb.options.length} low-stretch 1-line options for{" "}
                                  {mb.roleContextSummary})
                                </span>
                                <div className="space-y-1.5">
                                  {mb.options.map((opt, optIdx) => {
                                    const isChosenOpt = opt.id === (activeOpt?.id ?? "");
                                    const isEditingOpt = editingMalleableOptId === opt.id;
                                    return (
                                      <div
                                        key={opt.id}
                                        onClick={() => {
                                          setSelectedMalleableOption((prev) => ({
                                            ...prev,
                                            [mb.id]: opt.id,
                                          }));
                                          if (!acceptedMalleable.has(mb.id)) {
                                            setAcceptedMalleable((prev) => new Set(prev).add(mb.id));
                                          }
                                        }}
                                        className={`block rounded-lg border p-2.5 cursor-pointer transition-colors ${
                                          isChosenOpt
                                            ? "bg-emerald-50/40 border-emerald-300"
                                            : "bg-[#fafafa] border-[#ebebeb] hover:bg-neutral-50"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="radio"
                                              name={`malleable-opt-${mb.id}`}
                                              checked={isChosenOpt}
                                              onChange={() => {}}
                                              className="text-neutral-900 focus:ring-0"
                                            />
                                            <span className="font-mono text-[10px] font-semibold text-neutral-900">
                                              Option {optIdx + 1} · {opt.styleLabel}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] text-neutral-500">
                                              {opt.chars}/{opt.maxChars} chars · {opt.fit.badge}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedMalleableOption((prev) => ({
                                                  ...prev,
                                                  [mb.id]: opt.id,
                                                }));
                                                if (!acceptedMalleable.has(mb.id)) {
                                                  setAcceptedMalleable((prev) =>
                                                    new Set(prev).add(mb.id)
                                                  );
                                                }
                                                setEditingMalleableOptId(
                                                  isEditingOpt ? null : opt.id
                                                );
                                              }}
                                              className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-600 hover:text-neutral-900 bg-white border border-[#ebebeb] px-1.5 py-0.5 rounded cursor-pointer"
                                            >
                                              <Pencil className="w-2.5 h-2.5" />
                                              <span>{isEditingOpt ? "Done" : "Edit"}</span>
                                            </button>
                                          </div>
                                        </div>

                                        {isEditingOpt ? (
                                          <div className="pl-5 pt-1">
                                            <textarea
                                              autoFocus
                                              rows={2}
                                              value={opt.markup}
                                              onClick={(e) => e.stopPropagation()}
                                              onChange={(e) =>
                                                handleCustomMalleableOptionTextChange(
                                                  mb.id,
                                                  opt.id,
                                                  e.target.value
                                                )
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape")
                                                  setEditingMalleableOptId(null);
                                              }}
                                              className="w-full text-xs font-mono text-neutral-900 bg-white border border-emerald-400 rounded-md p-2 focus:outline-none resize-none"
                                            />
                                          </div>
                                        ) : (
                                          <p
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedMalleableOption((prev) => ({
                                                ...prev,
                                                [mb.id]: opt.id,
                                              }));
                                              if (!acceptedMalleable.has(mb.id)) {
                                                setAcceptedMalleable((prev) =>
                                                  new Set(prev).add(mb.id)
                                                );
                                              }
                                              setEditingMalleableOptId(opt.id);
                                            }}
                                            className="text-xs text-neutral-900 leading-relaxed pl-5 cursor-text"
                                          >
                                            {parseMarkup(opt.markup).map((seg, idx) =>
                                              seg.bold ? (
                                                <strong
                                                  key={idx}
                                                  className="font-semibold text-neutral-900"
                                                >
                                                  {seg.text}
                                                </strong>
                                              ) : (
                                                <span key={idx}>{seg.text}</span>
                                              )
                                            )}
                                          </p>
                                        )}

                                        <p className="text-[11px] text-neutral-500 font-mono pl-5 mt-1">
                                          {opt.easyExplanation}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <p className="text-[11px] text-neutral-500 font-mono">
                              Why it belongs here: {mb.believabilityCritique}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Step 5: AI Believability Reviewer & Top Recommendation */}
                {larpRun.aiRecommendation && (
                  <div className="border-t border-[#ebebeb] pt-4 space-y-3">
                    <div className="rounded-xl border border-neutral-900 bg-[#fafafa] p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-900 text-white">
                              <Sparkles className="w-3 h-3" />
                              AI Believability Recommendation
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              {larpRun.aiRecommendation.believabilityScore}% Believability Score
                            </span>
                          </div>
                          <h3 className="text-xs font-semibold text-neutral-900 pt-0.5">
                            {larpRun.aiRecommendation.verdictSummary}
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={handleSelectOnlyTopRecommended}
                          className="px-3 py-1.5 text-xs font-medium text-neutral-900 bg-white hover:bg-neutral-100 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                        >
                          Select Only Most Believable Pick
                        </button>
                      </div>

                      <p className="text-xs text-neutral-600 leading-relaxed">
                        {larpRun.aiRecommendation.whyMostBelievable}
                      </p>

                      <div className="rounded-lg bg-white border border-[#ebebeb] p-3 text-xs text-neutral-700 font-mono">
                        {larpRun.aiRecommendation.interviewTalkingPoint}
                      </div>

                      {/* Multi-Iteration Verification Passes */}
                      {larpRun.aiRecommendation.verificationPasses &&
                        larpRun.aiRecommendation.verificationPasses.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="block font-mono text-[10px] text-neutral-400 uppercase">
                              AI Multi-Check & Context Iteration Log ({larpRun.aiRecommendation.iterationsRun}{" "}
                              passes verified)
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {larpRun.aiRecommendation.verificationPasses.map((vp) => (
                                <div
                                  key={vp.passNumber}
                                  className="rounded-lg bg-white border border-[#ebebeb] p-2.5 text-xs space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-[10px] font-semibold text-neutral-900">
                                      {vp.name}
                                    </span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                                      {vp.status}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                                    {vp.detail}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      <div className="space-y-1.5 pt-1">
                        <span className="block font-mono text-[10px] text-neutral-400 uppercase">
                          All Proposed Changes Ranked by Live-Interview Believability
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {larpRun.aiRecommendation.rankings.map((r, idx) => (
                            <div
                              key={r.id}
                              className={`rounded-lg border p-2.5 text-xs flex items-start justify-between gap-2 ${
                                idx === 0
                                  ? "bg-white border-neutral-900"
                                  : "bg-white border-[#ebebeb]"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-[10px] font-semibold text-neutral-900">
                                    #{idx + 1} · {r.label}
                                  </span>
                                  <span className="font-mono text-[10px] text-neutral-500">
                                    ({r.containerTitle})
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">
                                  {r.rationale}
                                </p>
                              </div>
                              <span
                                className={`font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                                  idx === 0
                                    ? "bg-neutral-900 text-white"
                                    : "bg-neutral-100 text-neutral-700"
                                }`}
                              >
                                {r.score}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Queue to Preview Slot Bar */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#ebebeb] flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    {queuedSlotBanner && (
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-neutral-900 bg-neutral-100 border border-[#ebebeb] px-3 py-1 rounded-full">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Queued &ldquo;{queuedSlotBanner.latestTitle}&rdquo; ({queuedSlotBanner.count} in
                          Preview Queue)
                        </span>
                        <button
                          type="button"
                          onClick={() => router.push("/preview")}
                          className="underline font-semibold hover:text-neutral-600 cursor-pointer ml-1"
                        >
                          Open Preview Tab →
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleQueueIntoPreviewSlot}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Queue to Preview Slot</span>
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
