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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  loadPreviewQueue,
  updatePreviewQueueItem,
  deletePreviewQueueItem,
  type PreviewQueueItem,
} from "@/lib/resume/previewQueue";
import { applyLarpMutationsToResume } from "@/lib/resume/larpEngine";
import { compileResumePdfBlobUrl, downloadResumePdf } from "@/lib/resume/exportPdf";
import { parseMarkup } from "@/lib/resume/utils";

export default function PreviewPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [queue, setQueue] = useState<PreviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visualizedUrlBySlot, setVisualizedUrlBySlot] = useState<Record<string, string>>({});
  const [visualizingId, setVisualizingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const loaded = loadPreviewQueue(user.uid);
    setQueue(loaded);
    if (loaded.length > 0) {
      setSelectedId((prev) => (prev && loaded.some((i) => i.id === prev) ? prev : loaded[0].id));
    }
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
        | "acceptedBulletIds"
        | "acceptedMalleableIds"
        | "selectedMalleableOptionBySlotId"
        | "applySkillsSwap"
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

  const handleDeleteSlot = (slotId: string) => {
    const oldUrl = visualizedUrlBySlot[slotId];
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const nextQueue = deletePreviewQueueItem(user.uid, slotId);
    setQueue(nextQueue);
    if (selectedId === slotId) {
      setSelectedId(nextQueue[0]?.id ?? null);
    }
  };

  const buildTailoredResumeForSlot = (item: PreviewQueueItem) => {
    return applyLarpMutationsToResume(
      item.baseResume,
      item.larpRun,
      new Set(item.acceptedBulletIds),
      item.applySkillsSwap,
      new Set(item.acceptedMalleableIds),
      item.selectedMalleableOptionBySlotId
    );
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
      await downloadResumePdf(tailored, item.title || "Tailored_Resume");
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
            Select proposed edits per queued slot and visualize the compiled PDF right on screen
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
              Run a keyword & alignment check on the Operations page and click{" "}
              <span className="font-mono text-neutral-800">Queue to Preview Slot</span> to add
              entries here.
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
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
          {/* Left Sidebar: Queued Preview Slots */}
          <aside className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-3 space-y-2">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-[#ebebeb]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                Preview Queue
              </span>
              <span className="font-mono text-[10px] text-neutral-500">{queue.length}</span>
            </div>

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
              {queue.map((item, idx) => {
                const isSelected = item.id === activeItem.id;
                const isVisualized = Boolean(visualizedUrlBySlot[item.id]);
                const totalSelectedEdits =
                  item.acceptedBulletIds.length +
                  item.acceptedMalleableIds.length +
                  (item.applySkillsSwap && item.larpRun.skillSwaps.length > 0 ? 1 : 0);

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
                            {item.title}
                          </p>
                        </div>
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

          {/* Right Main Area: Edit Selector + In-Screen PDF Visualizer */}
          <div className="space-y-5 min-w-0">
            {/* Top Action Bar for Active Slot */}
            <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#ebebeb] pb-4">
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={activeItem.title}
                    onChange={(e) => updateActiveItem({ title: e.target.value })}
                    className="text-sm font-semibold text-neutral-900 bg-transparent border-b border-transparent focus:border-neutral-400 focus:outline-none w-full"
                  />
                  <p className="text-[11px] font-mono text-neutral-400 mt-0.5">
                    Queued {new Date(activeItem.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Toggle any edit below, then click Visualize PDF
                  </p>
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
                    disabled={downloadingId === activeItem.id}
                    onClick={() => handleOptionalDownload(activeItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                    title="Download PDF file if needed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* 1. Skills Swap Toggle */}
              {activeItem.larpRun.skillSwaps.length > 0 && (
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-900 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={activeItem.applySkillsSwap}
                      onChange={(e) => updateActiveItem({ applySkillsSwap: e.target.checked })}
                      className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                    />
                    <span>
                      Include Skills Section Additions (
                      {activeItem.larpRun.skillSwaps.flatMap((s) => s.added).join(", ")})
                    </span>
                  </label>
                </div>
              )}

              {/* 2. Subtle Existing-Bullet Edits */}
              {activeItem.larpRun.bulletProposals.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#ebebeb]">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    Existing Bullet Edits ({activeItem.acceptedBulletIds.length} of{" "}
                    {activeItem.larpRun.bulletProposals.length} selected)
                  </span>
                  <div className="space-y-2">
                    {activeItem.larpRun.bulletProposals.map((prop) => {
                      const checked = activeItem.acceptedBulletIds.includes(prop.bulletId);
                      return (
                        <label
                          key={prop.bulletId}
                          onClick={() => handleToggleBullet(prop.bulletId)}
                          className={`block rounded-xl border p-3 cursor-pointer transition-colors ${
                            checked
                              ? "border-neutral-900 bg-white"
                              : "border-[#ebebeb] bg-[#fafafa] opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {}}
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
                            </div>
                            <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              {prop.budget.candFit.badge} · {prop.budget.candChars} chars
                            </span>
                          </div>
                          <p className="text-xs text-neutral-800 pl-5 leading-relaxed">
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
                        </label>
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
                    {activeItem.larpRun.malleableBullets.length} selected)
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
                                      <span className="font-mono text-[10px] text-neutral-500">
                                        {opt.chars}/{opt.maxChars} chars · {opt.fit.badge}
                                      </span>
                                    </div>
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

            {/* In-Screen PDF Visualization Pane */}
            <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#fafafa]">
                <span className="font-mono text-[11px] font-semibold text-neutral-800">
                  On-Screen PDF Visualizer · {activeItem.title}
                </span>
                {visualizedUrlBySlot[activeItem.id] && (
                  <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    Live Rendered PDF (No Download Required)
                  </span>
                )}
              </div>

              {visualizedUrlBySlot[activeItem.id] ? (
                <iframe
                  src={visualizedUrlBySlot[activeItem.id]}
                  title={`PDF Preview - ${activeItem.title}`}
                  className="w-full h-[880px] border-0 bg-neutral-100"
                />
              ) : (
                <div className="h-[420px] flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <p className="text-xs text-neutral-500 max-w-sm">
                    Select the edits and phrasing option you want above, then click{" "}
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
        </div>
      )}
    </div>
  );
}
