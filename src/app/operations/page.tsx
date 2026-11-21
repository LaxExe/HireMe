"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  AlertCircle,
  Plus,
  Send,
  ArrowRight,
  Sparkles,
  Pencil,
  X,
  RotateCw,
  Download,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { subscribeMasterResumes } from "@/lib/resume/store";
import { isEmptyResume } from "@/lib/resume/latex";
import {
  matchJobDescriptionWithResume,
  type KeywordMatchResult,
} from "@/lib/resume/keywordMatch";
import {
  apiCompleter,
  runLarpAlignmentPipeline,
  runLarpAlignmentPipelineAsync,
  evaluateBelievabilityAndRecommend,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
  exportLedgerToCsv,
  exportLedgerToJson,
  formatScoreBreakdownSummary,
  logLarpUserActionEvent,
  registerCustomCatalogTerm,
  PYLON_TEST_JD,
  type LarpAlignmentRun,
  type LlmTelemetry,
  type Tier,
} from "@/lib/resume/larpEngine";
import {
  enqueuePreviewItem,
  loadPreviewQueue,
  subscribePreviewQueue,
  type PreviewQueueItem,
} from "@/lib/resume/previewQueue";
import { parseMarkup, plainText } from "@/lib/resume/utils";
import type { MasterResume } from "@/lib/resume/types";
import DefaultPicksBar from "@/components/resume/DefaultPicksBar";
import {
  applyDefaultPickToMasterResume,
  buildCompanyDefaultPicksMap,
  normalizeCompanyKey,
  saveGlobalRoleDefaultPick,
  toggleOrSelectDefaultPickInState,
  type RoleDefaultPickItem,
} from "@/lib/resume/defaultMalleablePicks";

export default function OperationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [masterResumes, setMasterResumes] = useState<MasterResume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [resumeReady, setResumeReady] = useState(false);

  const [roleName, setRoleName] = useState("");
  const [roleUrl, setRoleUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");

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
  const [previewQueue, setPreviewQueue] = useState<PreviewQueueItem[]>([]);
  const [queuedSlotBanner, setQueuedSlotBanner] = useState<{
    count: number;
    latestTitle: string;
    resumeName?: string;
  } | null>(null);
  const [missingResumePrompt, setMissingResumePrompt] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [excludedPairs, setExcludedPairs] = useState<Set<string>>(new Set());
  const [variantOffset, setVariantOffset] = useState(0);
  const [useAiProposer, setUseAiProposer] = useState(true);
  const [aiProposing, setAiProposing] = useState(false);
  const [llmTelemetry, setLlmTelemetry] = useState<LlmTelemetry | null>(null);
  const [collapsedMalleableIds, setCollapsedMalleableIds] = useState<Record<string, boolean>>({});

  const fetchJobDescriptionFromUrl = async (urlToFetch: string) => {
    if (!urlToFetch || !urlToFetch.trim()) return;
    setScrapingUrl(true);
    setScrapeError(null);
    try {
      const res = await fetch("/api/jobs/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToFetch.trim() }),
      });
      const data = await res.json();
      if (data?.success && data?.jobDescription) {
        setJobDescription(data.jobDescription);
      } else {
        setScrapeError(data?.error || "Could not extract job description from URL");
      }
    } catch (err: any) {
      setScrapeError(err?.message || "Failed to fetch from URL");
    } finally {
      setScrapingUrl(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const clearStoredOperationsDraft = (uidStr: string) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(`hireme_operations_jd_${uidStr}`);
    localStorage.removeItem(`hireme_operations_role_name_${uidStr}`);
    localStorage.removeItem(`hireme_operations_role_url_${uidStr}`);
  };

  useEffect(() => {
    if (!user) return;
    clearStoredOperationsDraft(user.uid);

    // Check for prefill from secret admin jobs feed or query params
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qRole = params.get("roleName");
      const qUrl = params.get("roleUrl");
      const qJd = params.get("jobDescription");

      let prefill: { roleName?: string; roleUrl?: string; jobDescription?: string } | null = null;
      try {
        const raw = sessionStorage.getItem("hireme_operations_prefill");
        if (raw) {
          prefill = JSON.parse(raw);
          sessionStorage.removeItem("hireme_operations_prefill");
        }
      } catch {}

      const targetRole = qRole || prefill?.roleName;
      const targetUrl = qUrl || prefill?.roleUrl;
      const targetJd = qJd || prefill?.jobDescription;

      if (targetRole) setRoleName(targetRole);
      if (targetUrl) setRoleUrl(targetUrl);
      if (targetJd) {
        setJobDescription(targetJd);
      } else if (targetUrl) {
        fetchJobDescriptionFromUrl(targetUrl);
      }
    }

    const unsubMaster = subscribeMasterResumes(user.uid, (collection) => {
      setMasterResumes(collection.resumes);
      setSelectedResumeId((prevId) => {
        if (prevId && collection.resumes.some((r) => r.id === prevId && !isEmptyResume(r))) {
          return prevId;
        }
        const preferred =
          collection.resumes.find(
            (r) => r.id === collection.activeResumeId && !isEmptyResume(r)
          ) ||
          collection.resumes.find((r) => !isEmptyResume(r)) ||
          collection.resumes[0];
        return preferred?.id || "";
      });
      setResumeReady(true);
    });

    const unsubPreview = subscribePreviewQueue(user.uid, (items) => {
      setPreviewQueue(items);
    });

    return () => {
      unsubMaster();
      unsubPreview();
    };
  }, [user]);

  if (loading || !user || !resumeReady) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  const validResumes = masterResumes.filter((r) => !isEmptyResume(r));
  const resume =
    validResumes.find((r) => r.id === selectedResumeId) ||
    masterResumes.find((r) => r.id === selectedResumeId) ||
    validResumes[0] ||
    masterResumes[0] ||
    null;

  const setResume = (updated: MasterResume | null) => {
    if (!updated) return;
    const targetId = updated.id || resume?.id;
    setMasterResumes((prev) =>
      prev.map((r) => (r.id === targetId ? { ...updated, id: r.id, name: r.name } : r))
    );
  };

  const hasValidResume = Boolean(resume && !isEmptyResume(resume));

  const executeAnalysisAndLarp = (
    targetJd: string,
    currentResume: MasterResume,
    customExcludedPairs?: Set<string>,
    customVariantOffset = 0
  ) => {
    const kwResult = matchJobDescriptionWithResume(targetJd, currentResume);
    const defaultPicksMap = buildCompanyDefaultPicksMap(currentResume, user.uid);
    const alignment = runLarpAlignmentPipeline(targetJd, currentResume, {
      jdId: roleName || undefined,
      variantOffset: customVariantOffset,
      excludePairs: customExcludedPairs,
      mode: "framing",
      focusedRecommendations: true,
      defaultPicksByCompanyKey: defaultPicksMap,
    });
    setMatchResult(kwResult);
    setLarpRun(alignment);
    setLlmTelemetry(null);
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

    if (useAiProposer) {
      setAiProposing(true);
      runLarpAlignmentPipelineAsync(targetJd, currentResume, {
        jdId: roleName || undefined,
        variantOffset: customVariantOffset,
        excludePairs: customExcludedPairs,
        mode: "framing",
        llm: apiCompleter,
        includeLlmMalleable: true,
        focusedRecommendations: true,
        defaultPicksByCompanyKey: defaultPicksMap,
      })
        .then((asyncRun) => {
          setLarpRun(asyncRun);
          if (asyncRun.llmTelemetry) {
            setLlmTelemetry(asyncRun.llmTelemetry);
          }
          setAcceptedBullets(new Set(asyncRun.bulletProposals.map((p) => p.bulletId)));
          const nextOptMap: Record<string, string> = {};
          for (const mb of asyncRun.malleableBullets) {
            if (mb.options && mb.options.length > 0) {
              nextOptMap[mb.id] = mb.options[0].id;
            }
          }
          setSelectedMalleableOption(nextOptMap);
        })
        .catch(() => {
          // Fail-soft: deterministic run is already rendered
        })
        .finally(() => {
          setAiProposing(false);
        });
    }
  };

  const handleRegenerateInOperations = () => {
    if (!resume || !larpRun || !jobDescription.trim()) return;
    const nextExclude = new Set(excludedPairs);
    for (const bp of larpRun.bulletProposals) {
      for (const kw of bp.injectedKeywords) {
        nextExclude.add(`${bp.bulletId}|${kw.toLowerCase()}`);
      }
    }
    const nextOffset = variantOffset + 1;
    setExcludedPairs(nextExclude);
    setVariantOffset(nextOffset);
    executeAnalysisAndLarp(jobDescription.trim(), resume, nextExclude, nextOffset);
  };

  const handleAddUnknownTermToCatalog = (term: string, tier: Tier = "tier_1_framing") => {
    if (!resume || !jobDescription.trim()) return;
    registerCustomCatalogTerm({ label: term, tier });
    executeAnalysisAndLarp(jobDescription.trim(), resume, excludedPairs, variantOffset);
  };

  const handleExportLedger = (format: "json" | "csv") => {
    if (!larpRun) return;
    const content =
      format === "json"
        ? exportLedgerToJson(larpRun.ledger, larpRun.runMetadata)
        : exportLedgerToCsv(larpRun.ledger, larpRun.runMetadata);
    const mime = format === "json" ? "application/json" : "text/csv;charset=utf-8";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alignment_ledger_${larpRun.runMetadata.jdId}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleSelectMasterResume = (newResumeId: string) => {
    setSelectedResumeId(newResumeId);
    const chosen = masterResumes.find((r) => r.id === newResumeId);
    if (chosen && !isEmptyResume(chosen)) {
      setMissingResumePrompt(false);
      if (jobDescription.trim() && (matchResult || larpRun)) {
        setExcludedPairs(new Set());
        setVariantOffset(0);
        executeAnalysisAndLarp(jobDescription.trim(), chosen, new Set(), 0);
      }
    }
  };

  const handleSubmitJobDescription = () => {
    const targetJd = jobDescription.trim();
    if (!targetJd) return;

    if (!hasValidResume || !resume) {
      setMissingResumePrompt(true);
      setMatchResult(null);
      setLarpRun(null);
      return;
    }

    setMissingResumePrompt(false);
    setExcludedPairs(new Set());
    setVariantOffset(0);
    executeAnalysisAndLarp(targetJd, resume, new Set(), 0);
  };

  const handleToggleBullet = (bulletId: string) => {
    setAcceptedBullets((prev) => {
      const next = new Set(prev);
      const wasSelected = next.has(bulletId);
      if (wasSelected) next.delete(bulletId);
      else next.add(bulletId);
      const bp = larpRun?.bulletProposals.find((p) => p.bulletId === bulletId);
      logLarpUserActionEvent({
        action: wasSelected ? "reject" : "accept",
        targetKind: "bullet_edit",
        targetId: bulletId,
        keyword: bp?.injectedKeywords[0],
        beforeText: bp?.originalMarkup,
        afterText: bp?.mutatedMarkup,
        jdId: larpRun?.runMetadata.jdId,
      });
      return next;
    });
  };

  const handleToggleMalleable = (malleableId: string) => {
    setAcceptedMalleable((prev) => {
      const next = new Set(prev);
      const wasSelected = next.has(malleableId);
      if (wasSelected) next.delete(malleableId);
      else next.add(malleableId);
      const mb = larpRun?.malleableBullets.find((m) => m.id === malleableId);
      logLarpUserActionEvent({
        action: wasSelected ? "reject" : "accept",
        targetKind: "new_bullet",
        targetId: malleableId,
        keyword: mb?.injectedKeywords.join(", "),
        afterText: mb?.markup,
        jdId: larpRun?.runMetadata.jdId,
      });
      return next;
    });
  };

  const handleCustomBulletProposalTextChange = (bulletId: string, newMarkup: string) => {
    logLarpUserActionEvent({
      action: "edit",
      targetKind: "bullet_edit",
      targetId: bulletId,
      afterText: newMarkup,
      jdId: larpRun?.runMetadata.jdId,
    });
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

  const handleQuickSelectDefaultPick = (pick: RoleDefaultPickItem) => {
    if (!resume || !larpRun) return;
    const {
      nextMalleableBullets,
      nextAcceptedMalleableIds,
      nextSelectedOptionMap,
    } = toggleOrSelectDefaultPickInState({
      pick,
      resume,
      malleableBullets: larpRun.malleableBullets,
      acceptedMalleableIds: Array.from(acceptedMalleable),
      selectedOptionBySlotId: selectedMalleableOption,
    });
    setLarpRun((prev) =>
      prev ? { ...prev, malleableBullets: nextMalleableBullets } : prev
    );
    setAcceptedMalleable(new Set(nextAcceptedMalleableIds));
    setSelectedMalleableOption(nextSelectedOptionMap);
  };

  const handleDefaultPickSaved = (pick: RoleDefaultPickItem, newMarkup: string) => {
    if (resume) {
      setResume(
        applyDefaultPickToMasterResume(
          resume,
          pick.containerId,
          pick.companyName,
          newMarkup
        )
      );
    }
    setLarpRun((prev) => {
      if (!prev) return prev;
      const nextMalleable = prev.malleableBullets.map((mb) => {
        const matches =
          mb.targetContainerId === pick.containerId ||
          (pick.companyKey &&
            normalizeCompanyKey(mb.targetContainerTitle).includes(pick.companyKey));
        if (!matches) return mb;
        const defOpt = mb.options.find(
          (o) => o.isDefaultPick || o.source === "default" || o.styleLabel === "Default Pick"
        );
        if (!defOpt) return mb;
        return updateMalleableOptionWithCustomMarkup(
          mb,
          defOpt.id,
          newMarkup,
          resume?.calibration
        );
      });
      return { ...prev, malleableBullets: nextMalleable };
    });
  };

  const handleQueueIntoPreviewSlot = () => {
    if (!resume || !larpRun) return;
    const item = enqueuePreviewItem(
      user.uid,
      {
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
      },
      previewQueue
    );
    const totalCount = previewQueue.length + 1;

    clearStoredOperationsDraft(user.uid);
    setRoleName("");
    setRoleUrl("");
    setJobDescription("");
    setMatchResult(null);
    setLarpRun(null);
    setAcceptedBullets(new Set());
    setAcceptedMalleable(new Set());
    setSelectedMalleableOption({});
    setEditingBulletId(null);
    setEditingMalleableOptId(null);
    setApplySkillsSwap(true);
    setMissingResumePrompt(false);
    const chosenResumeName =
      resume.name?.trim() || resume.contact.name?.trim() || "Master Resume";
    setQueuedSlotBanner({
      count: totalCount,
      latestTitle: item.title,
      resumeName: chosenResumeName,
    });
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
            Defensible Resume Alignment & keyword matching engine
          </p>
        </div>
      </div>

      {/* Queued Confirmation Banner (shown after Queue to Preview Slot resets inputs) */}
      {queuedSlotBanner && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-[#ebebeb] bg-white shadow-subtle px-4 py-3 animate-scaleIn">
          <div className="flex items-center gap-2.5 text-xs text-neutral-800">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white shrink-0">
              <Check className="w-3 h-3" />
            </span>
            <span>
              Queued <span className="font-semibold text-neutral-900">&ldquo;{queuedSlotBanner.latestTitle}&rdquo;</span>
              {queuedSlotBanner.resumeName ? (
                <>
                  {" "}using <span className="font-mono font-semibold text-neutral-900">{queuedSlotBanner.resumeName}</span>
                </>
              ) : null}{" "}
              ({queuedSlotBanner.count} in Preview Queue).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/preview")}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-white bg-neutral-900 hover:bg-neutral-800 px-3 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
            >
              <span>Open Preview Tab</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setQueuedSlotBanner(null)}
              aria-label="Dismiss notification"
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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

      {/* Direct Role & Job Description Input Card */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitJobDescription();
        }}
        className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-xs font-semibold tracking-tight text-neutral-900">
            Role & Job Description
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRoleName("Pylon — Software Engineer (Full-Stack)");
                setRoleUrl("https://usepylon.com/careers");
                setJobDescription(PYLON_TEST_JD);
              }}
              className="text-[11px] font-mono text-neutral-500 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2 py-0.5 rounded transition-colors active:scale-95 cursor-pointer"
            >
              Load Pylon Test JD
            </button>
            <span className="text-[11px] font-mono text-neutral-400">
              {jobDescription.trim().length} chars
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
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Pylon — Full-Stack Software Engineer"
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-mono uppercase text-neutral-500">
                Role Posting URL
              </label>
              {roleUrl.trim() && (
                <button
                  type="button"
                  disabled={scrapingUrl}
                  onClick={() => fetchJobDescriptionFromUrl(roleUrl)}
                  className="text-[10px] font-mono text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] px-2 py-0.5 rounded transition-all active:scale-95 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                  title="Extract job description from posting URL"
                >
                  <Sparkles className={`w-2.5 h-2.5 ${scrapingUrl ? "animate-spin text-neutral-900" : "text-neutral-500"}`} />
                  <span>{scrapingUrl ? "Extracting..." : "Fetch from URL"}</span>
                </button>
              )}
            </div>
            <input
              type="url"
              value={roleUrl}
              onChange={(e) => setRoleUrl(e.target.value)}
              placeholder="https://company.com/careers/job-id"
              className="w-full px-3 py-2 text-xs font-mono bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-mono uppercase text-neutral-500">
              Job Description
            </label>
            {scrapingUrl && (
              <span className="text-[10px] font-mono text-neutral-500 inline-flex items-center gap-1 animate-pulse">
                <Sparkles className="w-2.5 h-2.5 animate-spin text-neutral-800" />
                <span>Extracting from URL...</span>
              </span>
            )}
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => {
              setJobDescription(e.target.value);
              if (scrapeError) setScrapeError(null);
            }}
            placeholder="Paste the full job description, requirements, and qualifications here..."
            className="w-full h-44 p-3 text-xs leading-relaxed bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors resize-y"
          />
          {scrapeError && (
            <p className="text-[11px] text-amber-700 font-mono">
              {scrapeError}. You can paste the description manually above.
            </p>
          )}
        </div>

        {/* Master Resume Selection Bar (before analysis / submission) */}
        <div className="pt-2 border-t border-[#ebebeb] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                Select Master Resume ({validResumes.length})
              </span>
              <button
                type="button"
                onClick={() => router.push("/experience")}
                className="font-mono text-[10px] text-neutral-500 hover:text-neutral-900 underline underline-offset-2 cursor-pointer"
              >
                Manage in Experience
              </button>
            </div>
            {validResumes.length === 0 ? (
              <p className="text-[11px] font-mono text-amber-700">
                No master resume uploaded yet. Add one in Experience first.
              </p>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {validResumes.map((r, idx) => {
                  const isSelected = r.id === resume?.id;
                  const expCount = r.experience?.length || 0;
                  const projCount = r.projects?.length || 0;
                  return (
                    <button
                      key={r.id || idx}
                      type="button"
                      onClick={() => r.id && handleSelectMasterResume(r.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 active:scale-95 cursor-pointer ${
                        isSelected
                          ? "bg-neutral-900 border-neutral-900 text-white shadow-2xs"
                          : "bg-[#fafafa] border-[#ebebeb] text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300"
                      }`}
                    >
                      <FileText
                        className={`w-3 h-3 shrink-0 ${
                          isSelected ? "text-neutral-200" : "text-neutral-500"
                        }`}
                      />
                      <span className="truncate max-w-[160px]">
                        {r.name?.trim() || `Master Resume ${idx + 1}`}
                      </span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                          isSelected
                            ? "bg-white/15 text-neutral-200"
                            : "bg-white border border-[#ebebeb] text-neutral-500"
                        }`}
                      >
                        {expCount} exp · {projCount} proj
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="submit"
              disabled={!jobDescription.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Job Description</span>
            </button>
          </div>
        </div>
      </form>

      {/* Keyword Match & Alignment Results */}
      {matchResult && larpRun && (
            <div className="space-y-6 animate-fadeIn">
              {/* Summary Score Bar */}
              <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-2xl font-bold font-mono tracking-tight text-neutral-900">
                      {larpRun.coverage
                        ? `${larpRun.coverage.beforePercent}% → ${larpRun.coverage.afterPercent}%`
                        : `${matchResult.scorePercent}%`}
                    </span>
                    <span className="text-xs font-medium text-neutral-600">
                      Keyword Coverage (Before → After)
                    </span>
                    {larpRun.coverage && (
                      <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Weighted: {larpRun.coverage.weightedBeforePercent}% →{" "}
                        {larpRun.coverage.weightedAfterPercent}%
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-neutral-400">
                      ({matchResult.matchedCount} of {matchResult.totalDetected} technologies & skills on base resume)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-700 bg-[#fafafa] border border-[#ebebeb] px-2.5 py-1 rounded-full cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useAiProposer}
                        onChange={(e) => setUseAiProposer(e.target.checked)}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                      />
                      <span>AI Proposer ({aiProposing ? "Running..." : "Active"})</span>
                    </label>
                    {llmTelemetry && llmTelemetry.proposedCount > 0 && (
                      <span
                        className="font-mono text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"
                        title={`Model: ${llmTelemetry.model} · Prompt: ${llmTelemetry.promptVersion} · Latency: ${llmTelemetry.totalLatencyMs}ms`}
                      >
                        AI Survival: {llmTelemetry.survivedCount}/{llmTelemetry.proposedCount} (
                        {Math.round(llmTelemetry.survivalRate * 100)}%)
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleRegenerateInOperations}
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-700 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
                    >
                      <RotateCw className={`w-3 h-3 ${aiProposing ? "animate-spin" : ""}`} />
                      <span>Regenerate Plan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportLedger("json")}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Ledger JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportLedger("csv")}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Ledger CSV</span>
                    </button>
                    {larpRun.guardrailVerifiedZeroBanned && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        <Check className="w-3 h-3" />
                        <span>Tier-2 Banned Guardrail: 0 Injected</span>
                      </span>
                    )}
                    {resume && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-700 bg-[#fafafa] border border-[#ebebeb] px-2.5 py-1 rounded-full">
                        <FileText className="w-3 h-3 text-neutral-500" />
                        <span>{resume.name?.trim() || resume.contact.name || "Master Resume"}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden border border-[#ebebeb]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      (larpRun.coverage?.afterPercent ?? matchResult.scorePercent) >= 75
                        ? "bg-emerald-500"
                        : (larpRun.coverage?.afterPercent ?? matchResult.scorePercent) >= 45
                        ? "bg-amber-400"
                        : "bg-red-500"
                    }`}
                    style={{
                      width: `${larpRun.coverage?.afterPercent ?? matchResult.scorePercent}%`,
                    }}
                  />
                </div>

                {/* Unknown JD Terms List with Add to Catalog Action */}
                {larpRun.coverage && larpRun.coverage.unknownTerms.length > 0 && (
                  <div className="pt-2 border-t border-[#ebebeb] flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono text-[10px] uppercase text-neutral-500">
                      Unclassified JD Terms ({larpRun.coverage.unknownTerms.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {larpRun.coverage.unknownTerms.slice(0, 12).map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => handleAddUnknownTermToCatalog(term, "tier_1_5_skills_only")}
                          className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] text-neutral-700 active:scale-95 transition-all cursor-pointer"
                          title={`Add ${term} to catalog as Tier 1.5 skill`}
                        >
                          <Plus className="w-2.5 h-2.5 text-neutral-500" />
                          <span>{term}</span>
                          <span className="text-neutral-400">· Add to catalog</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                              <span
                                className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 border border-[#ebebeb] text-neutral-700 uppercase"
                                title="Candidate proposer source"
                              >
                                {prop.source ?? "rule"}
                              </span>
                              {prop.scoreFeatures && (
                                <span
                                  className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 text-white"
                                  title={formatScoreBreakdownSummary(prop.scoreFeatures)}
                                >
                                  Score {prop.totalScore ?? prop.scoreFeatures.total}
                                </span>
                              )}
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

                {/* Step 4: Malleable 1-Line Bullets (JD-Focused Synthesis + Default Picks) */}
                <div className="border-t border-[#ebebeb] pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-900">
                        Step 4 · Malleable 1-Line Bullets (1–2 JD Recommendations &amp; Default Picks)
                      </h3>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Generates 1–2 JD-aligned options for the best-fitting roles, plus your editable Default Picks saved across every job.
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2 py-0.5 rounded">
                      {acceptedMalleable.size} of {larpRun.malleableBullets.length} option(s) selected
                    </span>
                  </div>

                  {resume && (
                    <DefaultPicksBar
                      resume={resume}
                      uid={user.uid}
                      malleableBullets={larpRun.malleableBullets}
                      acceptedMalleableIds={Array.from(acceptedMalleable)}
                      selectedOptionBySlotId={selectedMalleableOption}
                      onQuickSelectDefaultPick={handleQuickSelectDefaultPick}
                      onDefaultPickSaved={handleDefaultPickSaved}
                    />
                  )}

                  {larpRun.malleableBullets.length === 0 ? (
                    <p className="text-xs font-mono text-neutral-400 py-2">
                      No candidate containers found to synthesize malleable lines for this resume.
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
                                {isTopPick ? (
                                  <span
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 text-white font-medium"
                                    title={
                                      mb.scoreFeatures
                                        ? formatScoreBreakdownSummary(mb.scoreFeatures)
                                        : mb.believabilityCritique
                                    }
                                  >
                                    Top Pick · Score {mb.believabilityScore}
                                  </span>
                                ) : (
                                  <span
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200"
                                    title={
                                      mb.scoreFeatures
                                        ? formatScoreBreakdownSummary(mb.scoreFeatures)
                                        : mb.believabilityCritique
                                    }
                                  >
                                    Score {mb.believabilityScore}
                                  </span>
                                )}
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 border border-[#ebebeb] text-neutral-600 uppercase">
                                  {activeOpt?.source ?? "template"}
                                </span>
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
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollapsedMalleableIds((prev) => ({
                                      ...prev,
                                      [mb.id]: !prev[mb.id],
                                    }))
                                  }
                                  aria-label={collapsedMalleableIds[mb.id] ? "Expand options" : "Collapse options"}
                                  className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer active:scale-95 ml-1"
                                >
                                  {collapsedMalleableIds[mb.id] ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Multiple Good, Low-Stretch Resume Point Options */}
                            {collapsedMalleableIds[mb.id] ? (
                              <div
                                onClick={() =>
                                  setCollapsedMalleableIds((prev) => ({
                                    ...prev,
                                    [mb.id]: false,
                                  }))
                                }
                                className="pl-5 pt-0.5 text-xs text-neutral-600 flex items-center justify-between gap-2 cursor-pointer hover:text-neutral-900 transition-colors group/summary"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                                    Active ({activeOpt?.styleLabel ?? "Option"}):
                                  </span>
                                  <span className="truncate text-neutral-800 font-mono text-[11px] group-hover/summary:text-neutral-900">
                                    {activeOpt ? plainText(activeOpt.markup) : plainText(mb.markup)}
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                                  {activeOpt?.chars ?? mb.chars} chars
                                </span>
                              </div>
                            ) : (
                              mb.options && mb.options.length > 0 && (
                              <div className="space-y-2">
                                <span className="block font-mono text-[10px] text-neutral-400 uppercase">
                                  Choose Phrasing Option ({mb.options.length} low-stretch 1-line options for{" "}
                                  {mb.roleContextSummary})
                                </span>
                                <div className="space-y-1.5">
                                  {mb.options.map((opt, optIdx) => {
                                    const isChosenOpt = opt.id === (activeOpt?.id ?? "");
                                    const isEditingOpt = editingMalleableOptId === opt.id;
                                    const isDefaultOption = Boolean(
                                      opt.isDefaultPick ||
                                        opt.source === "default" ||
                                        opt.styleLabel === "Default Pick"
                                    );
                                    const companyLabel =
                                      mb.targetContainerTitle.split(" · ").pop()?.trim() ||
                                      mb.targetContainerTitle;
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
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <input
                                              type="radio"
                                              name={`malleable-opt-${mb.id}`}
                                              checked={isChosenOpt}
                                              onChange={() => {}}
                                              className="text-neutral-900 focus:ring-0"
                                            />
                                            <span className="font-mono text-[10px] font-semibold text-neutral-900">
                                              {isDefaultOption
                                                ? `Default Pick · ${companyLabel}`
                                                : `Recommendation ${optIdx + 1} · ${opt.styleLabel}`}
                                            </span>
                                            {isDefaultOption && (
                                              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-neutral-900 text-white">
                                                All Jobs
                                              </span>
                                            )}
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
                                                if (isEditingOpt && isDefaultOption && resume) {
                                                  void saveGlobalRoleDefaultPick(
                                                    user.uid,
                                                    mb.targetContainerId,
                                                    companyLabel,
                                                    opt.markup,
                                                    resume
                                                  );
                                                  setResume(
                                                    applyDefaultPickToMasterResume(
                                                      resume,
                                                      mb.targetContainerId,
                                                      companyLabel,
                                                      opt.markup
                                                    )
                                                  );
                                                }
                                                setEditingMalleableOptId(
                                                  isEditingOpt ? null : opt.id
                                                );
                                              }}
                                              className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-600 hover:text-neutral-900 bg-white border border-[#ebebeb] px-1.5 py-0.5 rounded cursor-pointer"
                                            >
                                              <Pencil className="w-2.5 h-2.5" />
                                              <span>
                                                {isEditingOpt
                                                  ? isDefaultOption
                                                    ? "Save All Jobs"
                                                    : "Done"
                                                  : "Edit"}
                                              </span>
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
                            ))}

                            <p className="text-[11px] text-neutral-500 font-mono">
                              Why it belongs here: {mb.believabilityCritique}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Queue to Preview Slot Bar with Resume Selection */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#ebebeb]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                      Resume for Preview:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {validResumes.map((r, idx) => {
                        const isSelected = r.id === resume?.id;
                        return (
                          <button
                            key={`preview-pick-${r.id || idx}`}
                            type="button"
                            onClick={() => r.id && handleSelectMasterResume(r.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 active:scale-95 cursor-pointer ${
                              isSelected
                                ? "bg-neutral-900 border-neutral-900 text-white shadow-2xs"
                                : "bg-[#fafafa] border-[#ebebeb] text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300"
                            }`}
                          >
                            <FileText
                              className={`w-3 h-3 shrink-0 ${
                                isSelected ? "text-neutral-200" : "text-neutral-500"
                              }`}
                            />
                            <span className="truncate max-w-[160px]">
                              {r.name?.trim() || `Master Resume ${idx + 1}`}
                            </span>
                            {isSelected && (
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleQueueIntoPreviewSlot}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        Queue {resume?.name?.trim() ? `"${resume.name.trim()}" ` : ""}to Preview Slot
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
      )}
    </div>
  );
}
