"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  loadPreviewQueue,
  loadPreviewQueueAsync,
  subscribePreviewQueue,
  savePreviewQueue,
  updatePreviewQueueItem,
  deletePreviewQueueItem,
  type PreviewQueueItem,
} from "@/lib/resume/previewQueue";
import { loadMasterResume } from "@/lib/resume/store";
import {
  apiCompleter,
  applyLarpMutationsToResume,
  applySelectedSkillsToResumeCategories,
  evaluateBelievabilityAndRecommend,
  exportLedgerToCsv,
  exportLedgerToJson,
  formatScoreBreakdownSummary,
  getAvailableSkillCandidates,
  logLarpUserActionEvent,
  registerCustomCatalogTerm,
  runLarpAlignmentPipeline,
  runLarpAlignmentPipelineAsync,
  updateBulletProposalWithCustomMarkup,
  updateMalleableOptionWithCustomMarkup,
} from "@/lib/resume/larpEngine";
import {
  matchJobDescriptionWithResume,
  extractMinimumQualifications,
  type KeywordMatchResult,
  type MinimumQualificationsResult,
} from "@/lib/resume/keywordMatch";
import { pushResumeToAgents } from "@/lib/resume/agentsQueue";
import { compileResumePdfBlobUrl, downloadResumePdf } from "@/lib/resume/exportPdf";
import { knownTools, parseMarkup, plainText, uid } from "@/lib/resume/utils";
import { hasResumeSection, type MasterResume, type Job, type Project } from "@/lib/resume/types";
import CalibrationBar from "@/components/resume/CalibrationBar";
import { CalibrationProvider } from "@/context/CalibrationContext";
import { ContactSection, EducationSection } from "@/components/resume/ContactAndEducation";
import SkillsSection from "@/components/resume/SkillsSection";
import ExperienceSection from "@/components/resume/ExperienceSection";
import ProjectsSection from "@/components/resume/ProjectsSection";
import AwardsSection from "@/components/resume/AwardsSection";

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
  const [excludedPairsBySlot, setExcludedPairsBySlot] = useState<Record<string, string[]>>({});
  const [showJdDrawer, setShowJdDrawer] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [pushedAgentBanner, setPushedAgentBanner] = useState<{
    slotId: string;
    fileName: string;
    roleName: string;
  } | null>(null);
  const [refreshModalStep, setRefreshModalStep] = useState<null | "step1" | "step2" | "refreshing">(null);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; roleName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"alignment" | "editor">("alignment");
  const [collapsedMalleableIds, setCollapsedMalleableIds] = useState<Record<string, boolean>>({});
  const [isMalleableSectionCollapsed, setIsMalleableSectionCollapsed] = useState(false);

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

  const matchResult = useMemo<KeywordMatchResult | null>(() => {
    if (!activeItem?.jobDescription || !activeItem?.baseResume) return null;
    return matchJobDescriptionWithResume(activeItem.jobDescription, activeItem.baseResume);
  }, [activeItem?.jobDescription, activeItem?.baseResume]);

  const minimumQualifications = useMemo<MinimumQualificationsResult | null>(() => {
    if (!activeItem?.jobDescription) return null;
    return (
      matchResult?.minimumQualifications ??
      extractMinimumQualifications(activeItem.jobDescription)
    );
  }, [matchResult?.minimumQualifications, activeItem?.jobDescription]);

  const updateActiveItem = (
    patch: Partial<
      Pick<
        PreviewQueueItem,
        | "title"
        | "roleName"
        | "roleUrl"
        | "baseResume"
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
    const nextQueue = updatePreviewQueueItem(user.uid, activeItem.id, patch, queue);
    setQueue(nextQueue);
  };

  const known = useMemo(
    () =>
      activeItem?.baseResume
        ? knownTools(
            activeItem.baseResume.skills.flatMap((c) => c.skills.map((s) => s.name)),
            activeItem.baseResume.projects.map((p) => p.techStack)
          )
        : [],
    [activeItem?.baseResume]
  );

  const handleToggleSingleMalleable = (id: string) => {
    setCollapsedMalleableIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const allMalleableCollapsed = useMemo(() => {
    if (!activeItem || activeItem.larpRun.malleableBullets.length === 0) return false;
    return activeItem.larpRun.malleableBullets.every(
      (mb) => Boolean(collapsedMalleableIds[mb.id])
    );
  }, [activeItem, collapsedMalleableIds]);

  const handleToggleAllMalleableBullets = () => {
    if (!activeItem) return;
    const nextVal = !allMalleableCollapsed;
    const nextMap: Record<string, boolean> = {};
    for (const mb of activeItem.larpRun.malleableBullets) {
      nextMap[mb.id] = nextVal;
    }
    setCollapsedMalleableIds(nextMap);
  };

  const handleUpdateResume = (patch: Partial<MasterResume>) => {
    if (!activeItem) return;
    const updatedResume: MasterResume = {
      ...activeItem.baseResume,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    updateActiveItem({ baseResume: updatedResume });
    setVisualizedUrlBySlot((prev) => {
      if (prev[activeItem.id]) {
        URL.revokeObjectURL(prev[activeItem.id]);
        const next = { ...prev };
        delete next[activeItem.id];
        return next;
      }
      return prev;
    });
  };

  const handleExperienceChange = (newJobs: Job[]) => {
    if (!activeItem) return;
    const prevBulletsMap = new Map<string, string>();
    for (const j of activeItem.baseResume.experience) {
      for (const b of j.bullets) {
        prevBulletsMap.set(b.id, b.text);
      }
    }

    const nextAcceptedBulletIds = new Set(activeItem.acceptedBulletIds);
    for (const j of newJobs) {
      for (const b of j.bullets) {
        if (prevBulletsMap.has(b.id) && prevBulletsMap.get(b.id) !== b.text) {
          nextAcceptedBulletIds.delete(b.id);
        }
      }
    }

    const currentBulletIds = new Set(newJobs.flatMap((j) => j.bullets.map((b) => b.id)));
    for (const id of Array.from(nextAcceptedBulletIds)) {
      if (
        activeItem.larpRun.bulletProposals.some(
          (bp) => bp.bulletId === id && bp.containerKind === "experience"
        ) &&
        !currentBulletIds.has(id)
      ) {
        nextAcceptedBulletIds.delete(id);
      }
    }

    const updatedResume: MasterResume = {
      ...activeItem.baseResume,
      experience: newJobs,
      updatedAt: new Date().toISOString(),
    };

    updateActiveItem({
      baseResume: updatedResume,
      acceptedBulletIds: Array.from(nextAcceptedBulletIds),
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
  };

  const handleProjectsChange = (newProjects: Project[]) => {
    if (!activeItem) return;
    const prevBulletsMap = new Map<string, string>();
    for (const p of activeItem.baseResume.projects) {
      for (const b of p.bullets) {
        prevBulletsMap.set(b.id, b.text);
      }
    }

    const nextAcceptedBulletIds = new Set(activeItem.acceptedBulletIds);
    for (const p of newProjects) {
      for (const b of p.bullets) {
        if (prevBulletsMap.has(b.id) && prevBulletsMap.get(b.id) !== b.text) {
          nextAcceptedBulletIds.delete(b.id);
        }
      }
    }

    const currentBulletIds = new Set(newProjects.flatMap((p) => p.bullets.map((b) => b.id)));
    for (const id of Array.from(nextAcceptedBulletIds)) {
      if (
        activeItem.larpRun.bulletProposals.some(
          (bp) => bp.bulletId === id && bp.containerKind === "project"
        ) &&
        !currentBulletIds.has(id)
      ) {
        nextAcceptedBulletIds.delete(id);
      }
    }

    const updatedResume: MasterResume = {
      ...activeItem.baseResume,
      projects: newProjects,
      updatedAt: new Date().toISOString(),
    };

    updateActiveItem({
      baseResume: updatedResume,
      acceptedBulletIds: Array.from(nextAcceptedBulletIds),
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
  };

  const handleAddSection = (key: "awards" | "projects") => {
    if (!activeItem) return;
    if (key === "awards") {
      const nextAwards = [
        ...(activeItem.baseResume.awards ?? []),
        {
          id: uid("a"),
          title: "Award Title",
          organization: "Organization",
          date: "",
          description: "",
        },
      ];
      handleUpdateResume({ awards: nextAwards });
    } else if (key === "projects") {
      const nextProjects: Project[] = [
        ...activeItem.baseResume.projects,
        {
          id: uid("p"),
          name: "New Project",
          url: "",
          meta: "",
          techStack: [],
          bullets: [],
        },
      ];
      handleUpdateResume({ projects: nextProjects });
    }
  };

  const handleResetSlotToMaster = async () => {
    if (!user || !activeItem) return;
    const master = await loadMasterResume(user.uid);
    if (!master) {
      alert("Could not load your latest master resume.");
      return;
    }
    const confirmed = window.confirm(
      "Reset this job application's resume to your master resume? Any fine custom edits made for this role will be discarded."
    );
    if (!confirmed) return;

    updateActiveItem({
      baseResume: structuredClone(master),
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
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleToggleBullet = (bulletId: string) => {
    if (!activeItem) return;
    const set = new Set(activeItem.acceptedBulletIds);
    const wasSelected = set.has(bulletId);
    if (wasSelected) set.delete(bulletId);
    else set.add(bulletId);
    const bp = activeItem.larpRun.bulletProposals.find((p) => p.bulletId === bulletId);
    logLarpUserActionEvent({
      action: wasSelected ? "reject" : "accept",
      targetKind: "bullet_edit",
      targetId: bulletId,
      keyword: bp?.injectedKeywords[0],
      beforeText: bp?.originalMarkup,
      afterText: bp?.mutatedMarkup,
      jdId: activeItem.larpRun.runMetadata?.jdId ?? activeItem.id,
    });
    updateActiveItem({ acceptedBulletIds: Array.from(set) });
  };

  const handleToggleMalleable = (malleableId: string) => {
    if (!activeItem) return;
    const set = new Set(activeItem.acceptedMalleableIds);
    const wasSelected = set.has(malleableId);
    if (wasSelected) set.delete(malleableId);
    else set.add(malleableId);
    const mb = activeItem.larpRun.malleableBullets.find((m) => m.id === malleableId);
    logLarpUserActionEvent({
      action: wasSelected ? "reject" : "accept",
      targetKind: "new_bullet",
      targetId: malleableId,
      keyword: mb?.injectedKeywords.join(", "),
      afterText: mb?.markup,
      jdId: activeItem.larpRun.runMetadata?.jdId ?? activeItem.id,
    });
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
    logLarpUserActionEvent({
      action: "edit",
      targetKind: "bullet_edit",
      targetId: bulletId,
      afterText: newMarkup,
      jdId: activeItem.larpRun.runMetadata?.jdId ?? activeItem.id,
    });
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

  const handleRegenerateOptions = async () => {
    if (!activeItem || !user) return;
    setRegeneratingId(activeItem.id);
    const currentOffset = variantOffsetsBySlot[activeItem.id] || 0;
    const nextOffset = currentOffset + 1;
    setVariantOffsetsBySlot((prev) => ({ ...prev, [activeItem.id]: nextOffset }));

    const prevExcluded = new Set(excludedPairsBySlot[activeItem.id] ?? []);
    for (const bp of activeItem.larpRun.bulletProposals) {
      for (const kw of bp.injectedKeywords) {
        prevExcluded.add(`${bp.bulletId}|${kw.toLowerCase()}`);
      }
    }
    setExcludedPairsBySlot((prev) => ({
      ...prev,
      [activeItem.id]: Array.from(prevExcluded),
    }));

    const currentMaster = (await loadMasterResume(user.uid)) || activeItem.baseResume;

    const freshRun = runLarpAlignmentPipeline(
      activeItem.jobDescription,
      currentMaster,
      {
        jdId: activeItem.roleName || activeItem.title || activeItem.id,
        variantOffset: nextOffset,
        excludePairs: prevExcluded,
        mode: "framing",
      }
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
      baseResume: currentMaster,
      larpRun: freshRun,
      acceptedBulletIds: nextAcceptedBullets,
      acceptedMalleableIds: nextAcceptedMalleable,
      selectedMalleableOptionBySlotId: nextSelectedMalleableOpt,
    });

    runLarpAlignmentPipelineAsync(
      activeItem.jobDescription,
      currentMaster,
      {
        jdId: activeItem.roleName || activeItem.title || activeItem.id,
        variantOffset: nextOffset,
        excludePairs: prevExcluded,
        mode: "framing",
        llm: apiCompleter,
        includeLlmMalleable: true,
      }
    )
      .then((asyncRun) => {
        const asyncTopPick = asyncRun.aiRecommendation?.topPickId;
        const asyncAcceptedBullets =
          asyncTopPick && asyncRun.bulletProposals.some((b) => b.bulletId === asyncTopPick)
            ? [asyncTopPick]
            : asyncRun.bulletProposals.length > 0
            ? [asyncRun.bulletProposals[0].bulletId]
            : [];
        const asyncAcceptedMalleable =
          asyncTopPick && asyncRun.malleableBullets.some((m) => m.id === asyncTopPick)
            ? [asyncTopPick]
            : asyncRun.malleableBullets.length > 0
            ? [asyncRun.malleableBullets[0].id]
            : [];
        const asyncSelectedOpt = asyncRun.malleableBullets.reduce((acc, m) => {
          acc[m.id] = m.options[0]?.id;
          return acc;
        }, {} as Record<string, string>);

        updateActiveItem({
          baseResume: currentMaster,
          larpRun: asyncRun,
          acceptedBulletIds: asyncAcceptedBullets,
          acceptedMalleableIds: asyncAcceptedMalleable,
          selectedMalleableOptionBySlotId: asyncSelectedOpt,
        });
      })
      .catch(() => {})
      .finally(() => {
        setRegeneratingId(null);
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
  };

  const handleExecuteRefreshAll = async () => {
    if (!user || queue.length === 0) return;
    setRefreshModalStep("refreshing");
    try {
      const latestMaster = await loadMasterResume(user.uid);
      if (!latestMaster) {
        alert("Could not load your latest master resume. Please verify your resume is saved in Experience.");
        setRefreshModalStep(null);
        return;
      }

      const updatedQueue: PreviewQueueItem[] = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        setRefreshProgress({
          current: i + 1,
          total: queue.length,
          roleName: item.roleName || item.title || `Slot #${i + 1}`,
        });

        // 1. Run deterministic alignment pipeline with latest master resume
        const freshRun = runLarpAlignmentPipeline(item.jobDescription, latestMaster, {
          jdId: item.roleName || item.title || item.id,
          mode: "framing",
        });

        // 2. Re-analyze with LLM candidate proposer
        let finalRun = freshRun;
        try {
          const asyncRun = await runLarpAlignmentPipelineAsync(item.jobDescription, latestMaster, {
            jdId: item.roleName || item.title || item.id,
            mode: "framing",
            llm: apiCompleter,
            includeLlmMalleable: true,
          });
          if (asyncRun) {
            finalRun = asyncRun;
          }
        } catch (err) {
          console.warn("Async LLM proposal failed during refresh for slot:", item.id, err);
        }

        const topPick = finalRun.aiRecommendation?.topPickId;
        const nextAcceptedBullets =
          topPick && finalRun.bulletProposals.some((b) => b.bulletId === topPick)
            ? [topPick]
            : finalRun.bulletProposals.length > 0
            ? [finalRun.bulletProposals[0].bulletId]
            : [];

        const nextAcceptedMalleable =
          topPick && finalRun.malleableBullets.some((m) => m.id === topPick)
            ? [topPick]
            : finalRun.malleableBullets.length > 0
            ? [finalRun.malleableBullets[0].id]
            : [];

        const nextSelectedMalleableOpt = finalRun.malleableBullets.reduce((acc, m) => {
          acc[m.id] = m.options[0]?.id;
          return acc;
        }, {} as Record<string, string>);

        const nextSkillNames =
          item.applySkillsSwap && finalRun.skillSwaps
            ? finalRun.skillSwaps.flatMap((s) => s.added)
            : item.selectedSkillNames;

        updatedQueue.push({
          ...item,
          baseResume: structuredClone(latestMaster),
          larpRun: finalRun,
          acceptedBulletIds: nextAcceptedBullets,
          acceptedMalleableIds: nextAcceptedMalleable,
          selectedMalleableOptionBySlotId: nextSelectedMalleableOpt,
          selectedSkillNames: nextSkillNames,
        });
      }

      savePreviewQueue(user.uid, updatedQueue);
      setQueue(updatedQueue);
      setVisualizedUrlBySlot({});
      setPushedAgentBanner({
        slotId: "refresh-sync-banner",
        fileName: `${updatedQueue.length} ${updatedQueue.length === 1 ? "preview" : "previews"}`,
        roleName: "Updated with latest master resume & re-analyzed",
      });
    } catch (err) {
      console.error("Failed to refresh previews:", err);
      alert("An error occurred while refreshing previews.");
    } finally {
      setRefreshModalStep(null);
      setRefreshProgress(null);
    }
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
    const nextQueue = deletePreviewQueueItem(user.uid, slotId, queue);
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
      jobDescription: item.jobDescription,
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
      const contactName = tailored.contact?.name?.trim();
      const rolePart = (item.roleName || item.title || "")
        .replace(/\.pdf$/i, "")
        .replace(/_SYNTHETIC_LARP/gi, "")
        .replace(/_SYNTHETIC/gi, "")
        .replace(/SYNTHETIC/gi, "")
        .replace(/_LARP/gi, "")
        .replace(/\bLARP\b/gi, "")
        .replace(/Tailored_Resume/gi, "")
        .replace(/Tailored/gi, "")
        .trim();
      const downloadName = contactName
        ? `${contactName}${rolePart ? `_${rolePart}` : "_Resume"}`
        : rolePart || "Resume";
      await downloadResumePdf(tailored, downloadName);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
              preview
            </h1>
            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => setRefreshModalStep("step1")}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                title="Refresh all previews with latest master resume"
              >
                <RotateCw className="w-3.5 h-3.5 text-neutral-500" />
                <span>Refresh Previews</span>
              </button>
            )}
          </div>
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

      {/* Double-Confirmation Modal for Refreshing Previews */}
      {refreshModalStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4 animate-fadeIn"
          onClick={() => {
            if (refreshModalStep !== "refreshing") setRefreshModalStep(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#ebebeb] bg-white p-6 shadow-modal space-y-5 animate-scaleIn"
          >
            {refreshModalStep === "step1" && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-[#ebebeb] flex items-center justify-center text-neutral-800">
                      <RotateCw className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">
                        Refresh All Previews
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Sync with latest Master Resume
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-full font-medium">
                    Step 1 of 2
                  </span>
                </div>

                <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 space-y-2 text-xs text-amber-950">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Credit Usage Warning</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900/90">
                    Refreshing previews and reanalyzing takes up a lot of credits. This will re-run LARP keyword alignment and AI candidate proposals across all <span className="font-semibold">{queue.length}</span> queued role {queue.length === 1 ? "slot" : "slots"} using your latest Master Resume changes (such as updated job titles, dates, or skills).
                  </p>
                </div>

                <p className="text-xs font-medium text-neutral-800">
                  Are you sure you want to do this?
                </p>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#ebebeb]">
                  <button
                    type="button"
                    onClick={() => setRefreshModalStep(null)}
                    className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefreshModalStep("step2")}
                    className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {refreshModalStep === "step2" && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200/60 flex items-center justify-center text-red-600">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">
                        Confirm Re-analysis
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Final confirmation required
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-red-50 text-red-700 border border-red-200/60 px-2 py-0.5 rounded-full font-medium">
                    Step 2 of 2
                  </span>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-1.5 text-xs text-neutral-800">
                  <p className="font-semibold text-neutral-900">
                    Are you really sure you want to do this?
                  </p>
                  <p className="text-[11px] leading-relaxed text-neutral-600">
                    This will overwrite the base resume for all <span className="font-mono font-medium text-neutral-900">{queue.length}</span> preview slots with your latest Master Resume and invoke the AI proposer for each job description.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#ebebeb]">
                  <button
                    type="button"
                    onClick={() => setRefreshModalStep("step1")}
                    className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRefreshAll}
                    className="px-4 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    Yes, Refresh All Previews
                  </button>
                </div>
              </>
            )}

            {refreshModalStep === "refreshing" && (
              <div className="py-4 space-y-4 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-neutral-100 border border-[#ebebeb] text-neutral-800">
                  <RotateCw className="w-5 h-5 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Refreshing Previews with Latest Resume
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {refreshProgress ? (
                      <>
                        Analyzing slot <span className="font-mono font-semibold text-neutral-900">{refreshProgress.current}</span> of{" "}
                        <span className="font-mono font-semibold text-neutral-900">{refreshProgress.total}</span>:{" "}
                        <span className="text-neutral-700 font-medium">{refreshProgress.roleName}</span>
                      </>
                    ) : (
                      "Fetching latest master resume..."
                    )}
                  </p>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-neutral-900 h-1.5 transition-all duration-300"
                    style={{
                      width: refreshProgress
                        ? `${Math.round((refreshProgress.current / refreshProgress.total) * 100)}%`
                        : "20%",
                    }}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">
                  Please keep this window open while alignment runs.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
                    title="Download tailored PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>

                  {activeItem.larpRun.ledger && (
                    <button
                      type="button"
                      onClick={() => {
                        const json = exportLedgerToJson(
                          activeItem.larpRun.ledger,
                          activeItem.larpRun.runMetadata
                        );
                        const blob = new Blob([json], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `larp_study_ledger_${
                          activeItem.larpRun.runMetadata?.jdId || activeItem.id
                        }.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 1500);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Ledger JSON</span>
                    </button>
                  )}
                </div>
              </div>

              {/* View Mode Toggle Pill Dock */}
              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#ebebeb] pb-3">
                <div className="inline-flex items-center bg-[#ebebeb]/60 rounded-full border border-[#ebebeb] p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab("alignment")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full transition-all active:scale-95 cursor-pointer ${
                      activeTab === "alignment"
                        ? "bg-white text-neutral-900 shadow-sm font-semibold"
                        : "text-neutral-600 hover:text-neutral-900 font-medium"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Alignment & Proposals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("editor")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full transition-all active:scale-95 cursor-pointer ${
                      activeTab === "editor"
                        ? "bg-white text-neutral-900 shadow-sm font-semibold"
                        : "text-neutral-600 hover:text-neutral-900 font-medium"
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Customize Resume</span>
                  </button>
                </div>

                {activeTab === "editor" && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400 hidden sm:inline">
                      Job-specific overrides · Master resume untouched
                    </span>
                    <button
                      type="button"
                      onClick={handleResetSlotToMaster}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                      title="Reset this job application's resume to your master resume"
                    >
                      <RotateCw className="w-3 h-3 text-neutral-500" />
                      <span>Reset to Master</span>
                    </button>
                  </div>
                )}
              </div>

              {activeTab === "alignment" && (
                <>
              {/* Summary Score Bar */}
              {matchResult && (
                <div className="bg-[#fafafa] rounded-xl border border-[#ebebeb] p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-4">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-neutral-900">
                        {activeItem.larpRun.coverage
                          ? `${activeItem.larpRun.coverage.beforePercent}% → ${activeItem.larpRun.coverage.afterPercent}%`
                          : `${matchResult.scorePercent}%`}
                      </span>
                      <span className="text-xs font-semibold text-neutral-800">
                        Keyword Coverage (Before → After)
                      </span>
                      {activeItem.larpRun.coverage && (
                        <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          Weighted: {activeItem.larpRun.coverage.weightedBeforePercent}% →{" "}
                          {activeItem.larpRun.coverage.weightedAfterPercent}%
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-neutral-500">
                        ({matchResult.matchedCount} of {matchResult.totalDetected} technologies & skills on base resume)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {activeItem.larpRun.guardrailVerifiedZeroBanned && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                          <Check className="w-3 h-3" />
                          <span>Tier-2 Banned Guardrail: 0 Injected</span>
                        </span>
                      )}
                      {activeItem.baseResume?.contact?.name && (
                        <span className="font-mono text-[11px] text-neutral-500 bg-white border border-[#ebebeb] px-2.5 py-1 rounded-full">
                          {activeItem.baseResume.contact.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-neutral-200/70 overflow-hidden border border-[#ebebeb]">
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
              )}

              {/* 4-Tier Defensibility Classification Spec */}
              <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#ebebeb] pb-2.5">
                  <div>
                    <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wide">
                      4-Tier Defensibility Classification
                    </h2>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Extracted JD keywords bucketed by live-interview defensibility
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2 py-0.5 rounded">
                    Cap: ≤ Tier 1 in Bullets
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {/* MATCHED */}
                  <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-emerald-700 uppercase">
                        Matched
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {activeItem.larpRun.tiers.matched.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeItem.larpRun.tiers.matched.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {activeItem.larpRun.tiers.matched.length === 0 && (
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
                        {activeItem.larpRun.tiers.tier_0_workflow.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeItem.larpRun.tiers.tier_0_workflow.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {activeItem.larpRun.tiers.tier_0_workflow.length === 0 && (
                        <span className="text-[11px] font-mono text-neutral-400">none</span>
                      )}
                    </div>
                  </div>

                  {/* TIER 1: FRAMING */}
                  <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-indigo-700 uppercase">
                        Tier 1 · Framing
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {activeItem.larpRun.tiers.tier_1_framing.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeItem.larpRun.tiers.tier_1_framing.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {activeItem.larpRun.tiers.tier_1_framing.length === 0 && (
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
                        {activeItem.larpRun.tiers.tier_1_5_skills_only.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeItem.larpRun.tiers.tier_1_5_skills_only.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800 font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      {activeItem.larpRun.tiers.tier_1_5_skills_only.length === 0 && (
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
                        {activeItem.larpRun.tiers.tier_2_banned.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeItem.larpRun.tiers.tier_2_banned.map((k) => (
                        <span
                          key={k}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-red-100/80 border border-red-200 text-red-800 font-medium line-through"
                        >
                          {k}
                        </span>
                      ))}
                      {activeItem.larpRun.tiers.tier_2_banned.length === 0 && (
                        <span className="text-[11px] font-mono text-neutral-400">none</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Believability Reviewer & Top Recommendation */}
              {activeItem.larpRun.aiRecommendation && (
                <div className="rounded-xl border border-neutral-900 bg-[#fafafa] p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-900 text-white">
                          <Sparkles className="w-3 h-3" />
                          AI Believability Recommendation
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          {activeItem.larpRun.aiRecommendation.believabilityScore}% Believability Score
                        </span>
                      </div>
                      <h3 className="text-xs font-semibold text-neutral-900 pt-0.5">
                        {activeItem.larpRun.aiRecommendation.verdictSummary}
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
                    {activeItem.larpRun.aiRecommendation.whyMostBelievable}
                  </p>

                  {activeItem.larpRun.aiRecommendation.interviewTalkingPoint && (
                    <div className="rounded-lg bg-white border border-[#ebebeb] p-3 text-xs text-neutral-700 font-mono">
                      <span className="block font-sans text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">
                        Interview Talking Point
                      </span>
                      {activeItem.larpRun.aiRecommendation.interviewTalkingPoint}
                    </div>
                  )}

                  {activeItem.larpRun.aiRecommendation.verificationPasses &&
                    activeItem.larpRun.aiRecommendation.verificationPasses.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="block font-mono text-[10px] text-neutral-400 uppercase">
                          Real Guardrail & Coverage Verification ({activeItem.larpRun.aiRecommendation.iterationsRun}{" "}
                          checks · {activeItem.larpRun.aiRecommendation.verified ? "All Passed" : "Issues Detected"})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {activeItem.larpRun.aiRecommendation.verificationPasses.map((vp) => (
                            <div
                              key={vp.passNumber}
                              className="rounded-lg bg-white border border-[#ebebeb] p-2.5 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between font-mono text-[10px]">
                                <span className="font-semibold text-neutral-900">{vp.name}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded uppercase ${
                                    vp.status === "failed"
                                      ? "text-red-700 bg-red-50"
                                      : "text-emerald-700 bg-emerald-50"
                                  }`}
                                >
                                  {vp.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-neutral-500">{vp.detail}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* Per-Keyword Diagnostics Panel in Preview */}
              {activeItem.larpRun.diagnostics && activeItem.larpRun.diagnostics.length > 0 && (
                <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#ebebeb] pb-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                      Keyword Diagnostics ({activeItem.larpRun.diagnostics.length} JD keywords tracked)
                    </span>
                    <span className="font-mono text-[10px] text-neutral-400">
                      Zero Silent Failures
                    </span>
                  </div>
                  <div className="divide-y divide-[#ebebeb] max-h-48 overflow-y-auto">
                    {activeItem.larpRun.diagnostics.map((diag) => (
                      <div
                        key={diag.keyword}
                        className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-900">{diag.keyword}</span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full border ${
                              diag.status === "applied"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : diag.status === "already_covered"
                                ? "bg-neutral-100 border-neutral-200 text-neutral-700"
                                : diag.status === "skills_only"
                                ? "bg-violet-50 border-violet-200 text-violet-700"
                                : diag.status === "blocked"
                                ? "bg-red-50 border-red-200 text-red-700"
                                : "bg-amber-50 border-amber-200 text-amber-800"
                            }`}
                          >
                            {diag.status}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-neutral-600">
                          {diag.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

                {/* Minimum Qualifications (if present in the job description) */}
                {minimumQualifications && minimumQualifications.items.length > 0 && (
                  <div className="rounded-lg border border-[#ebebeb] bg-white p-3.5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-900" />
                        <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-900 font-semibold">
                          {minimumQualifications.heading}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2 py-0.5 rounded">
                        {minimumQualifications.items.length}{" "}
                        {minimumQualifications.items.length === 1 ? "requirement" : "requirements"}
                      </span>
                    </div>

                    <ul className="space-y-1.5 pt-0.5">
                      {minimumQualifications.items.map((qual, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs text-neutral-700 leading-relaxed"
                        >
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-900 flex-shrink-0" />
                          <span className="flex-1">{qual}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

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
                    {activeItem.larpRun.bulletProposals.length} selected)
                  </span>
                  <div className="space-y-3">
                    {activeItem.larpRun.bulletProposals.map((prop) => {
                      const checked = activeItem.acceptedBulletIds.includes(prop.bulletId);
                      const isEditing = editingBulletId === prop.bulletId;
                      return (
                        <div
                          key={prop.bulletId}
                          className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                            checked
                              ? "border-neutral-900 bg-white"
                              : "border-[#ebebeb] bg-[#fafafa] opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
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
                              </label>
                              {prop.contextCategory && (
                                <span className="font-mono text-[10px] text-neutral-500 bg-neutral-100 border border-[#ebebeb] px-1.5 py-0.5 rounded">
                                  {prop.contextCategory}
                                </span>
                              )}
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
                                  className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium"
                                >
                                  +{kw} (1 spot only)
                                </span>
                              ))}
                              <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                {prop.budget.candFit.badge} · {prop.budget.candFit.label} ({prop.budget.candChars} chars)
                              </span>
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-100 border border-[#ebebeb] text-neutral-600">
                                {prop.budget.origChars} → {prop.budget.candChars} chars · {prop.budget.origWidth} →{" "}
                                {prop.budget.candWidth} NCU
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

                          {prop.reason && (
                            <p className="text-[11px] text-neutral-500 font-mono">
                              Why this spot: {prop.reason}
                            </p>
                          )}

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 text-xs leading-relaxed pt-1">
                            <div className="rounded-lg bg-[#fafafa] border border-[#ebebeb] p-2.5">
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
                              className="rounded-lg bg-emerald-50/30 border border-emerald-200/70 hover:border-emerald-400 p-2.5 cursor-text transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="block font-mono text-[10px] text-emerald-700 uppercase">
                                  Rewritten to Fit {prop.budget.candFit.badge} Area ({prop.budget.candChars} chars · {prop.budget.candWidth} NCU)
                                </span>
                              </div>

                              {isEditing ? (
                                <textarea
                                  autoFocus
                                  rows={2}
                                  value={prop.mutatedMarkup}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    handleEditBulletProposalInPreview(prop.bulletId, e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditingBulletId(null);
                                  }}
                                  className="w-full text-xs font-mono text-neutral-900 bg-white border border-emerald-400 rounded-md p-2 focus:outline-none resize-none"
                                />
                              ) : (
                                <p className="text-neutral-900">
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Malleable 1-Line LARP Bullets (Collapsible) */}
              {activeItem.larpRun.malleableBullets.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-[#ebebeb]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsMalleableSectionCollapsed((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 text-left cursor-pointer group"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 group-hover:text-neutral-700 transition-colors">
                        Malleable 1-Line LARP Bullets ({activeItem.acceptedMalleableIds.length} of{" "}
                        {activeItem.larpRun.malleableBullets.length} selected)
                      </span>
                      {isMalleableSectionCollapsed ? (
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 transition-colors" />
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 transition-colors" />
                      )}
                    </button>

                    {!isMalleableSectionCollapsed && activeItem.larpRun.malleableBullets.length > 1 && (
                      <button
                        type="button"
                        onClick={handleToggleAllMalleableBullets}
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-500 hover:text-neutral-800 bg-[#fafafa] border border-[#ebebeb] px-2.5 py-0.5 rounded-full transition-colors cursor-pointer active:scale-95 shadow-2xs"
                      >
                        <span>{allMalleableCollapsed ? "Expand All" : "Collapse All"}</span>
                        {allMalleableCollapsed ? (
                          <ChevronDown className="w-3 h-3 text-neutral-400" />
                        ) : (
                          <ChevronUp className="w-3 h-3 text-neutral-400" />
                        )}
                      </button>
                    )}
                  </div>

                  {!isMalleableSectionCollapsed && (
                    <div className="space-y-2.5 animate-fadeIn">
                      {activeItem.larpRun.malleableBullets.map((mb) => {
                        const checked = activeItem.acceptedMalleableIds.includes(mb.id);
                        const chosenOptId =
                          activeItem.selectedMalleableOptionBySlotId?.[mb.id] ||
                          mb.options?.[0]?.id;
                        const chosenOpt =
                          mb.options?.find((o) => o.id === chosenOptId) || mb.options?.[0];
                        const isCollapsed = Boolean(collapsedMalleableIds[mb.id]);

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
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 border border-[#ebebeb] text-neutral-600 uppercase">
                                  {mb.options?.[0]?.source ?? "template"}
                                </span>
                                {mb.injectedKeywords.map((kw) => (
                                  <span
                                    key={kw}
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700"
                                  >
                                    +{kw}
                                  </span>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => handleToggleSingleMalleable(mb.id)}
                                  aria-label={isCollapsed ? "Expand bullet options" : "Collapse bullet options"}
                                  className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer ml-1 active:scale-95"
                                >
                                  {isCollapsed ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {isCollapsed ? (
                              <div
                                onClick={() => handleToggleSingleMalleable(mb.id)}
                                className="pl-5 pt-0.5 text-xs text-neutral-600 flex items-center justify-between gap-2 cursor-pointer hover:text-neutral-900 transition-colors group/summary"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                                    Active ({chosenOpt?.styleLabel ?? "Option"}):
                                  </span>
                                  <span className="truncate text-neutral-800 font-mono text-[11px] group-hover/summary:text-neutral-900">
                                    {chosenOpt ? plainText(chosenOpt.markup) : plainText(mb.markup)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono text-[10px] text-neutral-400">
                                    {chosenOpt?.chars ?? 0} chars
                                  </span>
                                  <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    {chosenOpt?.fit.badge ?? "1L"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              mb.options && mb.options.length > 0 && (
                                <div className="space-y-1.5 pl-5 animate-fadeIn">
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
                                              {opt.chars}/{opt.maxChars} chars · {opt.widthNcu} NCU · {opt.fit.badge}
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

                                        {opt.easyExplanation && (
                                          <p className="font-mono text-[10px] text-neutral-500 mb-1">
                                            Talking point: {opt.easyExplanation}
                                          </p>
                                        )}

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
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
                </>
              )}

              {/* View 2: Fine Resume Customizer for this Job Application */}
              {activeTab === "editor" && (
                <div className="space-y-6 animate-fadeIn pt-1">
                  {/* Jump To Navigation Bar */}
                  <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b border-[#ebebeb]">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 mr-1">
                      Jump to:
                    </span>
                    {[
                      { id: "sec-calibration", label: "Calibration" },
                      { id: "sec-contact", label: "Contact" },
                      { id: "sec-education", label: "Education" },
                      { id: "sec-skills", label: "Skills" },
                      { id: "sec-experience", label: "Experience" },
                      { id: "sec-projects", label: "Projects" },
                      { id: "sec-awards", label: "Awards" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => scrollToSection(s.id)}
                        className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-[#fafafa] hover:bg-neutral-100 text-neutral-700 border border-[#ebebeb] active:scale-95 transition-all cursor-pointer shadow-2xs"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <CalibrationProvider
                    key={activeItem.id}
                    initialCalibration={activeItem.baseResume.calibration}
                    onCalibrationChange={(cal) => handleUpdateResume({ calibration: cal })}
                  >
                    <div className="space-y-8 min-w-0">
                      <div id="sec-calibration" className="scroll-mt-20">
                        <CalibrationBar />
                      </div>

                      {hasResumeSection(activeItem.baseResume, "contact") && (
                        <ContactSection
                          contact={activeItem.baseResume.contact}
                          onChange={(contact) => handleUpdateResume({ contact })}
                        />
                      )}

                      {hasResumeSection(activeItem.baseResume, "education") && (
                        <EducationSection
                          items={activeItem.baseResume.education}
                          onChange={(education) => handleUpdateResume({ education })}
                        />
                      )}

                      {hasResumeSection(activeItem.baseResume, "skills") && (
                        <SkillsSection
                          categories={activeItem.baseResume.skills}
                          onChange={(skills) => handleUpdateResume({ skills })}
                        />
                      )}

                      {hasResumeSection(activeItem.baseResume, "experience") && (
                        <ExperienceSection
                          jobs={activeItem.baseResume.experience}
                          known={known}
                          onChange={handleExperienceChange}
                        />
                      )}

                      {hasResumeSection(activeItem.baseResume, "projects") ? (
                        <ProjectsSection
                          projects={activeItem.baseResume.projects}
                          known={known}
                          onChange={handleProjectsChange}
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#ebebeb] bg-[#fafafa] p-4 flex items-center justify-between gap-3">
                          <span className="text-xs text-neutral-500 font-mono">
                            No Projects section in this resume
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddSection("projects")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Projects</span>
                          </button>
                        </div>
                      )}

                      {hasResumeSection(activeItem.baseResume, "awards") ? (
                        <AwardsSection
                          awards={activeItem.baseResume.awards ?? []}
                          onChange={(awards) => handleUpdateResume({ awards })}
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#ebebeb] bg-[#fafafa] p-4 flex items-center justify-between gap-3">
                          <span className="text-xs text-neutral-500 font-mono">
                            No Awards section in this resume
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddSection("awards")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Awards</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </CalibrationProvider>
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
