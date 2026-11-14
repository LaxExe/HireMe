"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Trash2,
  Sparkles,
  Download,
  FileText,
  ArrowRight,
  ExternalLink,
  Pencil,
  Send,
  Check,
  Plus,
  X,
  RotateCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  loadPreviewQueue,
  loadPreviewQueueAsync,
  subscribePreviewQueue,
  updatePreviewQueueItem,
  deletePreviewQueueItem,
  type PreviewQueueItem,
} from "@/lib/resume/previewQueue";
import {
  applyLarpMutationsToResume,
  applySelectedSkillsToResumeCategories,
  evaluateBelievabilityAndRecommend,
  getAvailableSkillCandidates,
  runLarpAlignmentPipeline,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
} from "@/lib/resume/larpEngine";
import { pushResumeToAgents } from "@/lib/resume/agentsQueue";
import { compileResumePdfBlobUrl, downloadResumePdf } from "@/lib/resume/exportPdf";
import { parseMarkup } from "@/lib/resume/utils";

export default function PreviewPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [queue, setQueue] = useState<PreviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingBulletId, setEditingBulletId] = useState<string | null>(null);
  const [editingMalleableOptId, setEditingMalleableOptId] = useState<string | null>(null);
  const [visualizedUrlBySlot, setVisualizedUrlBySlot] = useState<Record<string, string>>({});
  const [visualizingId, setVisualizingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [variantOffsetsBySlot, setVariantOffsetsBySlot] = useState<Record<string, number>>({});
  const [showJdDrawer, setShowJdDrawer] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [pushedAgentBanner, setPushedAgentBanner] = useState<{
    slotId: string;
    fileName: string;
    roleName: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribePreviewQueue(user.uid, (freshQueue) => {
      setQueue(freshQueue);
      setSelectedId((prev) =>
        prev && freshQueue.some((i) => i.id === prev) ? prev : (freshQueue[0]?.id ?? null)
      );
    });
    return () => {
      unsubscribe();
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  const activeItem = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;

  const updateActiveItem = (
    patch: Partial<
      Pick<
        PreviewQueueItem,
        | "title"
        | "roleName"
        | "roleUrl"
        | "larpRun"
        | "acceptedBulletIds"
        | "acceptedMalleableIds"
        | "selectedMalleableOptionBySlotId"
        | "applySkillsSwap"
        | "selectedSkillNames"
        | "customSkillCategoryByName"
        | "pushedToAgentsAt"
      >
    >
  ) => {
    if (!activeItem) return;
    const nextQueue = updatePreviewQueueItem(user.uid, activeItem.id, patch);
    setQueue(nextQueue);
  };

  const handleToggleBullet = (bulletId: string) => {
    if (!activeItem) return;
    const set = new Set(activeItem.acceptedBulletIds);
    if (set.has(bulletId)) set.delete(bulletId);
    else set.add(bulletId);
    updateActiveItem({ acceptedBulletIds: Array.from(set) });
  };

  const handleToggleMalleable = (malleableId: string) => {
    if (!activeItem) return;
    const set = new Set(activeItem.acceptedMalleableIds);
    if (set.has(malleableId)) set.delete(malleableId);
    else set.add(malleableId);
    updateActiveItem({ acceptedMalleableIds: Array.from(set) });
  };

  const handleSelectMalleableOption = (slotId: string, optionId: string) => {
    if (!activeItem) return;
    const nextMap = {
      ...activeItem.selectedMalleableOptionBySlotId,
      [slotId]: optionId,
    };
    const set = new Set(activeItem.acceptedMalleableIds);
    set.add(slotId);
    updateActiveItem({
      selectedMalleableOptionBySlotId: nextMap,
      acceptedMalleableIds: Array.from(set),
    });
  };

  const handleEditBulletProposalInPreview = (bulletId: string, newMarkup: string) => {
    if (!activeItem) return;
    const nextProposals = activeItem.larpRun.bulletProposals.map((bp) =>
      bp.bulletId === bulletId
        ? updateBulletProposalWithCustomMarkup(
            bp,
            newMarkup,
            activeItem.baseResume.calibration
          )
        : bp
    );
    const nextLarpRun = {
      ...activeItem.larpRun,
      bulletProposals: nextProposals,
      aiRecommendation: evaluateBelievabilityAndRecommend(
        activeItem.larpRun.malleableBullets,
        nextProposals
      ),
    };
    updateActiveItem({ larpRun: nextLarpRun });
  };

  const handleEditMalleableOptionInPreview = (
    slotId: string,
    optionId: string,
    newMarkup: string
  ) => {
    if (!activeItem) return;
    const nextMalleable = activeItem.larpRun.malleableBullets.map((mb) =>
      mb.id === slotId
        ? updateMalleableOptionWithCustomMarkup(
            mb,
            optionId,
            newMarkup,
            activeItem.baseResume.calibration
          )
        : mb
    );
    const nextLarpRun = {
      ...activeItem.larpRun,
      malleableBullets: nextMalleable,
      aiRecommendation: evaluateBelievabilityAndRecommend(
        nextMalleable,
        activeItem.larpRun.bulletProposals
      ),
    };
    updateActiveItem({ larpRun: nextLarpRun });
  };

  const handleSelectOnlyTopRecommended = () => {
    if (!activeItem?.larpRun.aiRecommendation) return;
    const top = activeItem.larpRun.aiRecommendation;
    if (top.topPickKind === "malleable-new-line") {
      updateActiveItem({
        acceptedMalleableIds: [top.topPickId],
        acceptedBulletIds: [],
      });
    } else {
      updateActiveItem({
        acceptedMalleableIds: [],
        acceptedBulletIds: [top.topPickId],
      });
    }
  };

  const handleRegenerateOptions = () => {
    if (!activeItem) return;
    setRegeneratingId(activeItem.id);
    const currentOffset = variantOffsetsBySlot[activeItem.id] || 0;
    const nextOffset = currentOffset + 1;
    setVariantOffsetsBySlot((prev) => ({ ...prev, [activeItem.id]: nextOffset }));

    const freshRun = runLarpAlignmentPipeline(
      activeItem.jobDescription,
      activeItem.baseResume,
      nextOffset
    );

    const topPick = freshRun.aiRecommendation?.topPickId;
    const nextAcceptedBullets =
      topPick && freshRun.bulletProposals.some((b) => b.bulletId === topPick)
        ? [topPick]
        : freshRun.bulletProposals.length > 0
        ? [freshRun.bulletProposals[0].bulletId]
        : [];

    const nextAcceptedMalleable =
      topPick && freshRun.malleableBullets.some((m) => m.id === topPick)
        ? [topPick]
        : freshRun.malleableBullets.length > 0
        ? [freshRun.malleableBullets[0].id]
        : [];

    const nextSelectedMalleableOpt = freshRun.malleableBullets.reduce((acc, m) => {
      acc[m.id] = m.options[0]?.id;
      return acc;
    }, {} as Record<string, string>);

    updateActiveItem({
      larpRun: freshRun,
      acceptedBulletIds: nextAcceptedBullets,
      acceptedMalleableIds: nextAcceptedMalleable,
      selectedMalleableOptionBySlotId: nextSelectedMalleableOpt,
    });

    setVisualizedUrlBySlot((prev) => {
      if (prev[activeItem.id]) {
        URL.revokeObjectURL(prev[activeItem.id]);
        const next = { ...prev };
        delete next[activeItem.id];
        return next;
      }
      return prev;
    });

    setTimeout(() => setRegeneratingId(null), 350);
  };

  const handleDeleteSlot = (slotId: string) => {
    setVisualizedUrlBySlot((prev) => {
      if (prev[slotId]) {
        URL.revokeObjectURL(prev[slotId]);
      }
      if (!(slotId in prev)) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    const nextQueue = deletePreviewQueueItem(user.uid, slotId);
    setQueue(nextQueue);
    if (selectedId === slotId || activeItem?.id === slotId) {
      setSelectedId(nextQueue[0]?.id ?? null);
    }
  };

  const buildTailoredResumeForSlot = (item: PreviewQueueItem) => {
    return applyLarpMutationsToResume(
      item.baseResume,
      item.larpRun,
      new Set(item.acceptedBulletIds),
      item.selectedSkillNames.length > 0,
      new Set(item.acceptedMalleableIds),
      item.selectedMalleableOptionBySlotId,
      item.selectedSkillNames,
      item.customSkillCategoryByName
    );
  };

  const handleToggleSkillName = (skillName: string) => {
    if (!activeItem) return;
    const exists = activeItem.selectedSkillNames.some(
      (s) => s.toLowerCase() === skillName.toLowerCase()
    );
    const nextSkills = exists
      ? activeItem.selectedSkillNames.filter(
          (s) => s.toLowerCase() !== skillName.toLowerCase()
        )
      : [...activeItem.selectedSkillNames, skillName];
    updateActiveItem({
      selectedSkillNames: nextSkills,
      applySkillsSwap: nextSkills.length > 0,
    });
  };

  const handleSkillCategoryChange = (skillName: string, categoryId: string) => {
    if (!activeItem) return;
    const nextMap = {
      ...(activeItem.customSkillCategoryByName || {}),
      [skillName]: categoryId,
    };
    updateActiveItem({ customSkillCategoryByName: nextMap });
  };

  const handleAddCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    const clean = customSkillInput.trim();
    if (!clean) return;
    const exists = activeItem.selectedSkillNames.some(
      (s) => s.toLowerCase() === clean.toLowerCase()
    );
    if (!exists) {
      const nextSkills = [...activeItem.selectedSkillNames, clean];
      updateActiveItem({
        selectedSkillNames: nextSkills,
        applySkillsSwap: true,
      });
    }
    setCustomSkillInput("");
  };

  const handlePushToAgents = (item: PreviewQueueItem) => {
    const tailored = buildTailoredResumeForSlot(item);
    pushResumeToAgents(user.uid, {
      sourcePreviewId: item.id,
      roleName: item.roleName || item.title,
      roleUrl: item.roleUrl,
      tailoredResume: tailored,
    });
    handleDeleteSlot(item.id);
    router.push("/agents");
  };

  const handleVisualizeSlot = async (item: PreviewQueueItem) => {
    if (visualizingId) return;
    setVisualizingId(item.id);
    try {
      const tailored = buildTailoredResumeForSlot(item);
      const blobUrl = await compileResumePdfBlobUrl(tailored);
      setVisualizedUrlBySlot((prev) => {
        if (prev[item.id]) {
          URL.revokeObjectURL(prev[item.id]);
        }
        return { ...prev, [item.id]: blobUrl };
      });
    } finally {
      setVisualizingId(null);
    }
  };

  const handleOptionalDownload = async (item: PreviewQueueItem) => {
    if (downloadingId) return;
    setDownloadingId(item.id);
    try {
      const tailored = buildTailoredResumeForSlot(item);
      await downloadResumePdf(tailored, item.roleName || item.title || "Tailored_Resume");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            preview
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Select or customize proposed edits per queued role slot and visualize the compiled PDF on screen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-neutral-500 bg-white border border-[#ebebeb] px-3 py-1 rounded-full">
            {queue.length} {queue.length === 1 ? "slot" : "slots"} in queue
          </span>
          <button
            type="button"
            onClick={() => router.push("/operations")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <span>Operations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {pushedAgentBanner && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-[#ebebeb] bg-white shadow-subtle px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs text-neutral-800">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white shrink-0">
              <Check className="w-3 h-3" />
            </span>
            <span>
              Sent{" "}
              <span className="font-mono text-[11px] font-semibold text-neutral-900">
                {pushedAgentBanner.fileName}
              </span>{" "}
              ({pushedAgentBanner.roleName}) to Agents and removed from Preview.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/agents")}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-white bg-neutral-900 hover:bg-neutral-800 px-3 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
            >
              <span>Open Agents</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setPushedAgentBanner(null)}
              aria-label="Dismiss notification"
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {queue.length === 0 || !activeItem ? (
        <div className="w-full bg-white rounded-xl border border-[#ebebeb] shadow-subtle min-h-[340px] flex flex-col items-center justify-center p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-[#ebebeb] flex items-center justify-center text-neutral-500">
            <FileText className="w-4 h-4" />
          </div>
          <div className="space-y-1 max-w-md">
            <h2 className="text-sm font-semibold text-neutral-900">
              No tailored resume slots queued yet
            </h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Add a role name, URL, and job description on Operations, run{" "}
              <span className="font-mono text-neutral-800">Check Keyword Match</span>, and click{" "}
              <span className="font-mono text-neutral-800">Queue to Preview Slot</span> to send
              your tailored resume slot here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/operations")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
          >
            <span>Go to Operations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] gap-6 items-start">
          {/* Left Sidebar: Queued Preview Slots */}
          <aside className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-3 space-y-2">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-[#ebebeb]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                Preview Queue
              </span>
              <span className="font-mono text-[10px] text-neutral-500">{queue.length}</span>
            </div>

            <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
              {queue.map((item, idx) => {
                const isSelected = item.id === activeItem.id;
                const isVisualized = Boolean(visualizedUrlBySlot[item.id]);
                const totalSelectedEdits =
                  item.acceptedBulletIds.length +
                  item.acceptedMalleableIds.length +
                  item.selectedSkillNames.length;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`group rounded-lg border p-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? "border-neutral-900 bg-[#fafafa]"
                        : "border-[#ebebeb] bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-neutral-400">
                            #{queue.length - idx}
                          </span>
                          <p className="text-xs font-semibold text-neutral-900 truncate">
                            {item.roleName || item.title}
                          </p>
                        </div>
                        {item.roleUrl && (
                          <p className="font-mono text-[10px] text-neutral-400 truncate mt-0.5">
                            {item.roleUrl}
                          </p>
                        )}
                        <p className="font-mono text-[10px] text-neutral-500 mt-1">
                          {totalSelectedEdits} edits active
                          {isVisualized ? " · PDF ready" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSlot(item.id);
                        }}
                        className="p-1 text-neutral-400 hover:text-red-600 rounded opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right Main Area: Role Header + Edit Selector + In-Screen PDF Visualizer */}
          <div className="space-y-5 min-w-0">
            <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-4">
              {/* Role Name + URL + Visualize Action Bar */}
              <div className="flex items-start justify-between gap-3 flex-wrap border-b border-[#ebebeb] pb-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    type="text"
                    value={activeItem.roleName || activeItem.title}
                    onChange={(e) =>
                      updateActiveItem({ roleName: e.target.value, title: e.target.value })
                    }
                    placeholder="Role Name / Company..."
                    className="text-sm font-semibold text-neutral-900 bg-transparent border-b border-transparent focus:border-neutral-400 focus:outline-none w-full"
                  />

                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="url"
                      value={activeItem.roleUrl || ""}
                      onChange={(e) => updateActiveItem({ roleUrl: e.target.value })}
                      placeholder="https://company.com/careers/..."
                      className="text-[11px] font-mono text-neutral-600 bg-[#fafafa] border border-[#ebebeb] rounded px-2 py-0.5 w-64 max-w-full focus:outline-none focus:border-neutral-400"
                    />
                    {activeItem.roleUrl && (
                      <a
                        href={activeItem.roleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-700 hover:text-neutral-900 underline decoration-[#ebebeb] underline-offset-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open Posting</span>
                      </a>
                    )}
                    <span className="text-[11px] font-mono text-neutral-400">
                      · Queued{" "}
                      {new Date(activeItem.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {activeItem.larpRun.aiRecommendation && (
                    <button
                      type="button"
                      onClick={handleSelectOnlyTopRecommended}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] rounded-full active:scale-95 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Use AI Top Pick Only</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={regeneratingId === activeItem.id}
                    onClick={handleRegenerateOptions}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] rounded-full active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    title="Regenerate alternative bullet phrasings and malleable options"
                  >
                    <RotateCw
                      className={`w-3.5 h-3.5 ${
                        regeneratingId === activeItem.id
                          ? "animate-spin text-neutral-900"
                          : "text-neutral-500"
                      }`}
                    />
                    <span>
                      {regeneratingId === activeItem.id
                        ? "Regenerating..."
                        : "Regenerate Options"}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={visualizingId === activeItem.id}
                    onClick={() => handleVisualizeSlot(activeItem)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      {visualizingId === activeItem.id ? "Rendering PDF..." : "Visualize PDF"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePushToAgents(activeItem)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-900 rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Push to Agents</span>
                  </button>

                  <button
                    type="button"
                    disabled={downloadingId === activeItem.id}
                    onClick={() => handleOptionalDownload(activeItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                    title="Optional PDF download"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Job Description & Extracted Main Skills Banner */}
              <div className="rounded-xl border border-[#ebebeb] bg-[#fafafa] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                      Extracted Job Skills
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#ebebeb] text-neutral-600">
                      {activeItem.larpRun.tiers.tier_1_framing.length +
                        activeItem.larpRun.tiers.tier_0_workflow.length +
                        activeItem.larpRun.tiers.matched.length}{" "}
                      signals
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowJdDrawer((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] px-2.5 py-1 rounded-md cursor-pointer transition-colors shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{showJdDrawer ? "Hide Job Description" : "View Job Description"}</span>
                    {showJdDrawer ? (
                      <ChevronUp className="w-3 h-3 text-neutral-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-neutral-400" />
                    )}
                  </button>
                </div>

                {/* Badges for Framing Tech, Workflow Tools, and Matched Stack */}
                <div className="flex flex-wrap gap-2.5 items-center">
                  {activeItem.larpRun.tiers.tier_1_framing.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-[10px] text-neutral-400 mr-0.5">
                        Target Tech:
                      </span>
                      {activeItem.larpRun.tiers.tier_1_framing.map((skill) => (
                        <span
                          key={skill}
                          className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {activeItem.larpRun.tiers.tier_0_workflow.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-[10px] text-neutral-400 mr-0.5">
                        Workflow & PM:
                      </span>
                      {activeItem.larpRun.tiers.tier_0_workflow.map((tool) => (
                        <span
                          key={tool}
                          className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 font-medium"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {activeItem.larpRun.tiers.matched.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-[10px] text-neutral-400 mr-0.5">
                        Matched Stack:
                      </span>
                      {activeItem.larpRun.tiers.matched.slice(0, 6).map((skill) => (
                        <span
                          key={skill}
                          className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700"
                        >
                          {skill}
                        </span>
                      ))}
                      {activeItem.larpRun.tiers.matched.length > 6 && (
                        <span className="font-mono text-[10px] text-neutral-400">
                          +{activeItem.larpRun.tiers.matched.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Expandable Raw Job Description */}
                {showJdDrawer && (
                  <div className="pt-2 border-t border-[#ebebeb] space-y-1.5 animate-fadeIn">
                    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
                      <span>Job Description Text</span>
                      <span>{activeItem.jobDescription.length} characters</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-[#ebebeb] bg-white p-3 font-mono text-[11px] text-neutral-700 leading-relaxed whitespace-pre-wrap selection:bg-neutral-200">
                      {activeItem.jobDescription || "No job description text provided."}
                    </div>
                  </div>
                )}
              </div>

              {/* 1. Independent Skills Section Additions */}
              {(() => {
                const candidates = getAvailableSkillCandidates(
                  activeItem.baseResume.skills,
                  activeItem.larpRun.tiers,
                  activeItem.larpRun.skillSwaps,
                  activeItem.selectedSkillNames,
                  activeItem.customSkillCategoryByName
                );
                const liveSkillResult = applySelectedSkillsToResumeCategories(
                  activeItem.baseResume.skills,
                  activeItem.larpRun.tiers,
                  activeItem.selectedSkillNames,
                  activeItem.customSkillCategoryByName
                );

                return (
                  <div className="space-y-2.5 pt-2 border-t border-[#ebebeb]">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                        Skills Section Additions ({activeItem.selectedSkillNames.length} selected)
                      </span>
                      {activeItem.selectedSkillNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveItem({
                              selectedSkillNames: [],
                              applySkillsSwap: false,
                            })
                          }
                          className="font-mono text-[10px] text-neutral-500 hover:text-neutral-900 underline decoration-[#ebebeb] cursor-pointer"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {candidates.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {candidates.map((cand) => {
                          const isChecked = activeItem.selectedSkillNames.some(
                            (s) => s.toLowerCase() === cand.name.toLowerCase()
                          );
                          return (
                            <div
                              key={cand.name}
                              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${
                                isChecked
                                  ? "border-neutral-900 bg-[#fafafa]"
                                  : "border-[#ebebeb] bg-white opacity-80"
                              }`}
                            >
                              <label className="inline-flex items-center gap-2 text-xs text-neutral-900 cursor-pointer select-none min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleSkillName(cand.name)}
                                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                                />
                                <span className="font-medium truncate">{cand.name}</span>
                                {cand.recommendedSwap && (
                                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-neutral-900 text-white shrink-0">
                                    Pick
                                  </span>
                                )}
                              </label>

                              <select
                                value={cand.targetCategoryId}
                                onChange={(e) =>
                                  handleSkillCategoryChange(cand.name, e.target.value)
                                }
                                aria-label={`Category for ${cand.name}`}
                                className="font-mono text-[10px] text-neutral-600 bg-white border border-[#ebebeb] rounded px-1.5 py-0.5 max-w-[130px] focus:outline-none focus:border-neutral-400"
                              >
                                {activeItem.baseResume.skills.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-neutral-400">
                        No missing non-banned JD skills detected; add custom skills below if needed.
                      </p>
                    )}

                    <form onSubmit={handleAddCustomSkill} className="flex items-center gap-2 pt-0.5">
                      <input
                        type="text"
                        value={customSkillInput}
                        onChange={(e) => setCustomSkillInput(e.target.value)}
                        placeholder="Add custom skill (e.g. Redis, Vercel)..."
                        className="flex-1 text-xs text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-neutral-400 placeholder:text-neutral-400"
                      />
                      <button
                        type="submit"
                        disabled={!customSkillInput.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </form>

                    {liveSkillResult.changes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {liveSkillResult.changes.map((chg) => (
                          <span
                            key={chg.categoryId}
                            className={`inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded border ${
                              chg.newNcu <= 98.0
                                ? "bg-emerald-50/70 text-emerald-700 border-emerald-200"
                                : "bg-amber-50/80 text-amber-700 border-amber-200"
                            }`}
                          >
                            <span>
                              {chg.categoryName}: +{chg.added.join(", +")}
                            </span>
                            {chg.swappedOut.length > 0 && (
                              <span className="opacity-75">
                                (swapped {chg.swappedOut.join(", ")})
                              </span>
                            )}
                            <span>
                              · {chg.newNcu.toFixed(1)}/98 NCU
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 2. Subtle Existing-Bullet Edits (Click to Toggle or Inline Edit) */}
              {activeItem.larpRun.bulletProposals.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#ebebeb]">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    Existing Bullet Edits ({activeItem.acceptedBulletIds.length} of{" "}
                    {activeItem.larpRun.bulletProposals.length} selected · click text to edit)
                  </span>
                  <div className="space-y-2">
                    {activeItem.larpRun.bulletProposals.map((prop) => {
                      const checked = activeItem.acceptedBulletIds.includes(prop.bulletId);
                      const isEditing = editingBulletId === prop.bulletId;
                      return (
                        <div
                          key={prop.bulletId}
                          className={`rounded-xl border p-3 transition-colors ${
                            checked
                              ? "border-neutral-900 bg-white"
                              : "border-[#ebebeb] bg-[#fafafa] opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleBullet(prop.bulletId)}
                                className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                              />
                              <span className="text-xs font-semibold text-neutral-900">
                                {prop.containerTitle}
                              </span>
                              {prop.injectedKeywords.map((kw) => (
                                <span
                                  key={kw}
                                  className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700"
                                >
                                  +{kw}
                                </span>
                              ))}
                            </label>

                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                {prop.budget.candFit.badge} · {prop.budget.candChars} chars
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingBulletId(isEditing ? null : prop.bulletId)
                                }
                                className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-600 hover:text-neutral-900 bg-[#fafafa] border border-[#ebebeb] px-1.5 py-0.5 rounded cursor-pointer"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>{isEditing ? "Done" : "Edit"}</span>
                              </button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="pl-5 pt-1">
                              <textarea
                                autoFocus
                                rows={2}
                                value={prop.mutatedMarkup}
                                onChange={(e) =>
                                  handleEditBulletProposalInPreview(prop.bulletId, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingBulletId(null);
                                }}
                                className="w-full text-xs font-mono text-neutral-900 bg-white border border-emerald-400 rounded-md p-2 focus:outline-none resize-none"
                              />
                            </div>
                          ) : (
                            <p
                              onClick={() => setEditingBulletId(prop.bulletId)}
                              className="text-xs text-neutral-800 pl-5 leading-relaxed cursor-text"
                            >
                              {parseMarkup(prop.mutatedMarkup).map((seg, idx) =>
                                seg.bold ? (
                                  <strong key={idx} className="font-semibold text-neutral-900">
                                    {seg.text}
                                  </strong>
                                ) : (
                                  <span key={idx}>{seg.text}</span>
                                )
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Malleable 1-Line LARP Bullets & Multiple Phrasing Options */}
              {activeItem.larpRun.malleableBullets.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-[#ebebeb]">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    Malleable 1-Line LARP Bullets ({activeItem.acceptedMalleableIds.length} of{" "}
                    {activeItem.larpRun.malleableBullets.length} selected · click option text to edit)
                  </span>
                  <div className="space-y-2.5">
                    {activeItem.larpRun.malleableBullets.map((mb) => {
                      const checked = activeItem.acceptedMalleableIds.includes(mb.id);
                      const chosenOptId =
                        activeItem.selectedMalleableOptionBySlotId?.[mb.id] ||
                        mb.options?.[0]?.id;

                      return (
                        <div
                          key={mb.id}
                          className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                            checked
                              ? "border-neutral-900 bg-white"
                              : "border-[#ebebeb] bg-[#fafafa] opacity-75"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleMalleable(mb.id)}
                                className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                              />
                              <span className="text-xs font-semibold text-neutral-900">
                                New 1L Bullet in {mb.targetContainerTitle}
                              </span>
                            </label>
                            <div className="flex items-center gap-1.5">
                              {mb.injectedKeywords.map((kw) => (
                                <span
                                  key={kw}
                                  className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700"
                                >
                                  +{kw}
                                </span>
                              ))}
                            </div>
                          </div>

                          {mb.options && mb.options.length > 0 && (
                            <div className="space-y-1.5 pl-5">
                              {mb.options.map((opt, optIdx) => {
                                const isOptSelected = opt.id === chosenOptId;
                                const isEditingOpt = editingMalleableOptId === opt.id;
                                return (
                                  <div
                                    key={opt.id}
                                    onClick={() => handleSelectMalleableOption(mb.id, opt.id)}
                                    className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
                                      isOptSelected
                                        ? "bg-emerald-50/40 border-emerald-300"
                                        : "bg-[#fafafa] border-[#ebebeb] hover:bg-neutral-50"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                      <span className="font-mono text-[10px] font-semibold text-neutral-900">
                                        Option {optIdx + 1} · {opt.styleLabel}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] text-neutral-500">
                                          {opt.chars}/{opt.maxChars} chars · {opt.fit.badge}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectMalleableOption(mb.id, opt.id);
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
                                      <textarea
                                        autoFocus
                                        rows={2}
                                        value={opt.markup}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) =>
                                          handleEditMalleableOptionInPreview(
                                            mb.id,
                                            opt.id,
                                            e.target.value
                                          )
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Escape") setEditingMalleableOptId(null);
                                        }}
                                        className="w-full mt-1 text-xs font-mono text-neutral-900 bg-white border border-emerald-400 rounded-md p-2 focus:outline-none resize-none"
                                      />
                                    ) : (
                                      <p className="text-xs text-neutral-900 leading-relaxed">
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
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width Bottom On-Screen PDF Visualization Pane */}
        <div className="relative left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] sm:w-[calc(100vw-3rem)]">
          <div className="w-full bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
            <div className="px-4 sm:px-6 py-3 border-b border-[#ebebeb] flex items-center justify-between gap-3 flex-wrap bg-[#fafafa]">
              <span className="font-mono text-[11px] font-semibold text-neutral-800">
                On-Screen PDF Visualizer · {activeItem.roleName || activeItem.title}
              </span>
              <div className="flex items-center gap-2">
                {visualizedUrlBySlot[activeItem.id] && (
                  <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    Live Rendered PDF (No Download Required)
                  </span>
                )}
                <button
                  type="button"
                  disabled={visualizingId === activeItem.id}
                  onClick={() => handleVisualizeSlot(activeItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-neutral-800 bg-white hover:bg-neutral-100 border border-[#ebebeb] rounded-full disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>
                    {visualizingId === activeItem.id
                      ? "Rendering..."
                      : visualizedUrlBySlot[activeItem.id]
                        ? "Refresh PDF"
                        : "Visualize PDF"}
                  </span>
                </button>
              </div>
            </div>

            {visualizedUrlBySlot[activeItem.id] ? (
              <iframe
                src={visualizedUrlBySlot[activeItem.id]}
                title={`PDF Preview - ${activeItem.roleName || activeItem.title}`}
                className="w-full h-[88vh] min-h-[760px] border-0 bg-neutral-100"
              />
            ) : (
              <div className="h-[420px] flex flex-col items-center justify-center p-8 text-center space-y-3">
                <p className="text-xs text-neutral-500 max-w-sm">
                  Select or edit the proposed bullets above, then click{" "}
                  <span className="font-semibold text-neutral-900">Visualize PDF</span> to render
                  your tailored resume right here on screen without downloading a file.
                </p>
                <button
                  type="button"
                  disabled={visualizingId === activeItem.id}
                  onClick={() => handleVisualizeSlot(activeItem)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {visualizingId === activeItem.id ? "Rendering PDF..." : "Visualize PDF"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
