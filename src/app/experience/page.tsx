"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2, Pencil, Check, Upload, Download, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  saveMasterResumes,
  subscribeMasterResumes,
  ensureResumeMeta,
} from "@/lib/resume/store";
import {
  subscribePreloadedTemplates,
  addPreloadedTemplate,
  renamePreloadedTemplate,
  deletePreloadedTemplate,
  downloadPreloadedTemplatePdf,
  formatFileSize,
  type PreloadedResumeTemplate,
} from "@/lib/resume/preloadedTemplates";
import { isEmptyResume } from "@/lib/resume/latex";
import { knownTools, uid } from "@/lib/resume/utils";
import {
  DEFAULT_RESUME_FORMAT,
  emptyResume,
  hasResumeSection,
  type MasterResume,
} from "@/lib/resume/types";
import { downloadResumePdf, downloadResumeTex } from "@/lib/resume/exportPdf";
import ResumeImporter from "@/components/resume/ResumeImporter";
import ResumeTree from "@/components/resume/ResumeTree";
import CalibrationBar from "@/components/resume/CalibrationBar";
import { CalibrationProvider } from "@/context/CalibrationContext";
import { ContactSection, EducationSection } from "@/components/resume/ContactAndEducation";
import SkillsSection from "@/components/resume/SkillsSection";
import ExperienceSection from "@/components/resume/ExperienceSection";
import ProjectsSection from "@/components/resume/ProjectsSection";
import AwardsSection from "@/components/resume/AwardsSection";

export default function ExperiencePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [resumes, setResumes] = useState<MasterResume[]>([]);
  const [activeResumeId, setActiveResumeId] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [renamingActive, setRenamingActive] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const skipSave = useRef(true);

  // Preloaded Resume Templates state
  const [preloadedTemplates, setPreloadedTemplates] = useState<PreloadedResumeTemplate[]>([]);
  const [preloadedModalOpen, setPreloadedModalOpen] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [downloadingTplId, setDownloadingTplId] = useState<string | null>(null);
  const [renamingTplId, setRenamingTplId] = useState<string | null>(null);
  const [renamingTplValue, setRenamingTplValue] = useState("");
  const preloadedFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Load and subscribe to live master resume collection changes across devices
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeMasterResumes(user.uid, (collection) => {
      skipSave.current = true;
      if (collection.resumes.length === 0) {
        const initial = emptyResume({ id: "master-1", name: "Master Resume 1" });
        setResumes([initial]);
        setActiveResumeId(initial.id!);
      } else {
        setResumes(collection.resumes);
        setActiveResumeId((prevId) => {
          if (prevId && collection.resumes.some((r) => r.id === prevId)) {
            return prevId;
          }
          return collection.activeResumeId || collection.resumes[0].id!;
        });
      }
      setReady(true);
    });
    const unsubTemplates = subscribePreloadedTemplates(user.uid, (templates) => {
      setPreloadedTemplates(templates);
    });
    return () => {
      unsubscribe();
      unsubTemplates();
    };
  }, [user]);

  const activeResume = useMemo(() => {
    if (resumes.length === 0) return null;
    return resumes.find((r) => r.id === activeResumeId) || resumes[0];
  }, [resumes, activeResumeId]);

  // Debounced autosave of the full collection
  useEffect(() => {
    if (!user || resumes.length === 0 || !ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const resolvedActiveId =
      activeResumeId && resumes.some((r) => r.id === activeResumeId)
        ? activeResumeId
        : resumes[0].id!;
    const t = setTimeout(
      () =>
        saveMasterResumes(user.uid, {
          resumes,
          activeResumeId: resolvedActiveId,
        }),
      400
    );
    return () => clearTimeout(t);
  }, [resumes, activeResumeId, user, ready]);

  const update = useCallback(
    (patch: Partial<MasterResume>) => {
      skipSave.current = false;
      setResumes((prev) => {
        if (prev.length === 0) return prev;
        const targetId =
          activeResumeId && prev.some((r) => r.id === activeResumeId)
            ? activeResumeId
            : prev[0].id!;
        return prev.map((r) =>
          r.id === targetId
            ? { ...r, ...patch, updatedAt: new Date().toISOString() }
            : r
        );
      });
    },
    [activeResumeId]
  );

  const known = useMemo(
    () =>
      activeResume
        ? knownTools(
            activeResume.skills.flatMap((c) => c.skills.map((s) => s.name)),
            activeResume.projects.map((p) => p.techStack)
          )
        : [],
    [activeResume]
  );

  if (loading || !user || !ready) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  const handleSelectResumeTab = (targetId: string) => {
    if (targetId === activeResume?.id) return;
    skipSave.current = false;
    setActiveResumeId(targetId);
    setImporting(false);
    setRenamingActive(false);
  };

  const handleCreateNewResume = () => {
    const nextNumber = resumes.length + 1;
    let candidateName = `Master Resume ${nextNumber}`;
    const existingNames = new Set(resumes.map((r) => (r.name || "").toLowerCase()));
    let suffix = nextNumber;
    while (existingNames.has(candidateName.toLowerCase())) {
      suffix += 1;
      candidateName = `Master Resume ${suffix}`;
    }

    const newResume = emptyResume({
      id: uid("master"),
      name: candidateName,
    });

    const nextResumes = [...resumes, newResume];
    skipSave.current = false;
    setResumes(nextResumes);
    setActiveResumeId(newResume.id!);
    setImporting(false);
    setRenamingActive(true);
    void saveMasterResumes(user.uid, {
      resumes: nextResumes,
      activeResumeId: newResume.id!,
    });

    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 30);
  };

  const handleDeleteResume = (targetId: string) => {
    if (resumes.length <= 1) return;
    const target = resumes.find((r) => r.id === targetId);
    if (!target) return;

    if (!isEmptyResume(target)) {
      const confirmed = window.confirm(
        `Delete "${target.name || "Master Resume"}"? This action cannot be undone.`
      );
      if (!confirmed) return;
    }

    const nextResumes = resumes.filter((r) => r.id !== targetId);
    const nextActiveId =
      activeResumeId === targetId
        ? nextResumes[0]?.id || ""
        : activeResumeId;

    skipSave.current = false;
    setResumes(nextResumes);
    setActiveResumeId(nextActiveId);
    setImporting(false);
    void saveMasterResumes(user.uid, {
      resumes: nextResumes,
      activeResumeId: nextActiveId,
    });
  };

  const handleParsed = (parsed: MasterResume) => {
    const currentId = activeResume?.id || "master-1";
    const currentName =
      activeResume?.name?.trim() ||
      `Master Resume ${Math.max(1, resumes.length)}`;

    const merged: MasterResume = ensureResumeMeta(
      {
        ...parsed,
        id: currentId,
        name: currentName,
        updatedAt: new Date().toISOString(),
      },
      0
    );

    const exists = resumes.some((r) => r.id === currentId);
    const nextResumes = exists
      ? resumes.map((r) => (r.id === currentId ? merged : r))
      : [...resumes, merged];

    skipSave.current = false;
    setResumes(nextResumes);
    setActiveResumeId(currentId);
    setImporting(false);
    void saveMasterResumes(user.uid, {
      resumes: nextResumes,
      activeResumeId: currentId,
    });
  };

  const openExportModal = () => {
    if (!activeResume) return;
    const defaultBase = activeResume.contact.name
      ? `${activeResume.contact.name.trim().replace(/\s+/g, "_")}_Resume`
      : (activeResume.name || "Resume").trim().replace(/\s+/g, "_");
    setExportName(defaultBase);
    setExportModalOpen(true);
  };

  const handleConfirmExport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeResume || exporting) return;
    setExporting(true);
    try {
      await downloadResumePdf(activeResume, exportName || "Resume");
      if (user) {
        await saveMasterResumes(user.uid, {
          resumes,
          activeResumeId: activeResume.id || activeResumeId,
        });
      }
      setExportModalOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const openPreloadedModal = () => {
    setUploadFile(null);
    setUploadLabel("");
    setUploadError(null);
    setPreloadedModalOpen(true);
  };

  const handlePreloadedFileSelect = (file: File | null) => {
    setUploadError(null);
    if (!file) {
      setUploadFile(null);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".tex")) {
      setUploadError("Please select a .pdf or .tex resume file.");
      setUploadFile(null);
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setUploadError("File exceeds 4 MB limit.");
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
    if (!uploadLabel.trim()) {
      setUploadLabel(file.name.replace(/\.(pdf|tex)$/i, "").replace(/[_-]+/g, " ").trim());
    }
  };

  const handleConfirmUploadPreloaded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !uploadFile || uploadingTemplate) return;
    setUploadingTemplate(true);
    setUploadError(null);
    try {
      const isPdf = uploadFile.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const pdfDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Could not read PDF file."));
          reader.readAsDataURL(uploadFile);
        });
        const added = addPreloadedTemplate(
          user.uid,
          {
            name: uploadLabel.trim() || uploadFile.name.replace(/\.pdf$/i, ""),
            fileName: uploadFile.name,
            fileType: "pdf",
            pdfDataUrl,
            fileSizeBytes: uploadFile.size,
          },
          preloadedTemplates
        );
        setPreloadedTemplates((prev) => [added, ...prev.filter((t) => t.id !== added.id)]);
      } else {
        const texSource = await uploadFile.text();
        const added = addPreloadedTemplate(
          user.uid,
          {
            name: uploadLabel.trim() || uploadFile.name.replace(/\.tex$/i, ""),
            fileName: uploadFile.name,
            fileType: "tex",
            texSource,
            fileSizeBytes: uploadFile.size,
          },
          preloadedTemplates
        );
        setPreloadedTemplates((prev) => [added, ...prev.filter((t) => t.id !== added.id)]);
      }
      setPreloadedModalOpen(false);
      setUploadFile(null);
      setUploadLabel("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleDeletePreloaded = (tplId: string) => {
    if (!user) return;
    const next = deletePreloadedTemplate(user.uid, tplId, preloadedTemplates);
    setPreloadedTemplates(next);
  };

  const handleCommitRenamePreloaded = (tplId: string) => {
    if (!user) return;
    if (renamingTplValue.trim()) {
      const next = renamePreloadedTemplate(user.uid, tplId, renamingTplValue, preloadedTemplates);
      setPreloadedTemplates(next);
    }
    setRenamingTplId(null);
    setRenamingTplValue("");
  };

  const handleDownloadPreloaded = async (tpl: PreloadedResumeTemplate) => {
    if (downloadingTplId) return;
    setDownloadingTplId(tpl.id);
    try {
      await downloadPreloadedTemplatePdf(tpl, tpl.fileName.replace(/\.(pdf|tex)$/i, ""));
    } finally {
      setDownloadingTplId(null);
    }
  };

  const activeIsEmpty = !activeResume || isEmptyResume(activeResume);
  const showImporter = activeIsEmpty || importing;
  const fmt = activeResume?.format ?? DEFAULT_RESUME_FORMAT;

  return (
    <CalibrationProvider
      key={activeResume?.id || "default-cal"}
      initialCalibration={activeResume?.calibration}
      onCalibrationChange={(cal) => update({ calibration: cal })}
    >
      <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
              experience
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Manage multiple master resumes, preloaded ready-to-send templates, and bullet density
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openPreloadedModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-800 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-neutral-600" />
              <span>Add Preloaded Template</span>
            </button>
            <button
              type="button"
              onClick={handleCreateNewResume}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-800 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-neutral-600" />
              <span>New Master Resume</span>
            </button>
            {activeResume && !activeIsEmpty && !importing && (
              <>
                <button
                  type="button"
                  onClick={() => setImporting(true)}
                  className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
                >
                  Replace .tex
                </button>
                <button
                  type="button"
                  onClick={openExportModal}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle active:scale-95 transition-all cursor-pointer"
                >
                  Export
                </button>
              </>
            )}
          </div>
        </div>

        {/* Multi-Resume Switcher & Active Resume Rename Bar */}
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                Master Resumes ({resumes.length})
              </span>
            </div>
            <button
              type="button"
              onClick={handleCreateNewResume}
              className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-neutral-700 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Resume</span>
            </button>
          </div>

          {/* Resume Tabs List */}
          <div className="flex items-center gap-2 flex-wrap">
            {resumes.map((r, idx) => {
              const isSelected = r.id === activeResume?.id;
              const empty = isEmptyResume(r);
              const expCount = r.experience?.length || 0;
              const projCount = r.projects?.length || 0;
              return (
                <div
                  key={r.id || idx}
                  className={`inline-flex items-center rounded-full border transition-all duration-150 ${
                    isSelected
                      ? "bg-neutral-900 border-neutral-900 text-white shadow-2xs"
                      : "bg-[#fafafa] border-[#ebebeb] text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectResumeTab(r.id!)}
                    className="inline-flex items-center gap-2 pl-3 pr-2.5 py-1.5 text-xs font-medium rounded-full active:scale-95 transition-all cursor-pointer"
                  >
                    <FileText
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? "text-neutral-200" : "text-neutral-500"
                      }`}
                    />
                    <span className="truncate max-w-[180px]">
                      {r.name?.trim() || `Master Resume ${idx + 1}`}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                        isSelected
                          ? "bg-white/15 text-neutral-200"
                          : "bg-white border border-[#ebebeb] text-neutral-500"
                      }`}
                    >
                      {empty ? "empty" : `${expCount} exp · ${projCount} proj`}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Active Resume Name & Metadata Editor */}
          {activeResume && (
            <div className="pt-3 border-t border-[#ebebeb] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label
                  htmlFor="active-master-resume-name"
                  className="font-mono text-[10px] uppercase text-neutral-500 shrink-0"
                >
                  Resume Name
                </label>
                <div className="relative flex items-center flex-1 max-w-sm">
                  <input
                    id="active-master-resume-name"
                    ref={nameInputRef}
                    type="text"
                    value={activeResume.name ?? ""}
                    onFocus={() => setRenamingActive(true)}
                    onBlur={() => {
                      setRenamingActive(false);
                      if (!activeResume.name || !activeResume.name.trim()) {
                        const fallbackIdx =
                          resumes.findIndex((r) => r.id === activeResume.id) + 1;
                        update({ name: `Master Resume ${fallbackIdx || 1}` });
                      }
                    }}
                    onChange={(e) => update({ name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="e.g. Systems / Backend Master Resume"
                    className="w-full px-3 py-1.5 pr-8 text-xs font-semibold text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (renamingActive) {
                        nameInputRef.current?.blur();
                      } else {
                        nameInputRef.current?.focus();
                        nameInputRef.current?.select();
                      }
                    }}
                    aria-label="Rename master resume"
                    className="absolute right-2 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer"
                  >
                    {renamingActive ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Pencil className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {!activeIsEmpty && activeResume.contact.name && (
                  <span className="font-mono text-[11px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] px-2.5 py-1 rounded-full">
                    {activeResume.contact.name}
                  </span>
                )}
                {activeIsEmpty && (
                  <span className="font-mono text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    Upload .tex below to populate this resume
                  </span>
                )}
                {resumes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteResume(activeResume.id!)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-500 hover:text-red-600 bg-[#fafafa] hover:bg-red-50 border border-[#ebebeb] hover:border-red-200 px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preloaded Ready-to-Send Resume Templates */}
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                Preloaded Templates ({preloadedTemplates.length})
              </span>
              <span className="font-mono text-[10px] text-neutral-400">
                · Ready to select &amp; push directly in Preview
              </span>
            </div>
            <button
              type="button"
              onClick={openPreloadedModal}
              className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-neutral-700 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Preloaded File</span>
            </button>
          </div>

          {preloadedTemplates.length === 0 ? (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#fafafa] border border-dashed border-[#ebebeb]">
              <span className="text-xs text-neutral-500">
                No preloaded resume files yet. Upload a ready-to-send <span className="font-mono text-neutral-700">.pdf</span> or <span className="font-mono text-neutral-700">.tex</span> template.
              </span>
              <button
                type="button"
                onClick={openPreloadedModal}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-800 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <Upload className="w-3 h-3 text-neutral-600" />
                <span>Upload File</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {preloadedTemplates.map((tpl) => {
                const isRenaming = renamingTplId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl bg-[#fafafa] border border-[#ebebeb] hover:border-neutral-300 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`font-mono text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                          tpl.fileType === "pdf"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-neutral-100 text-neutral-700 border-neutral-200"
                        }`}
                      >
                        {tpl.fileType}
                      </span>
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <input
                            type="text"
                            autoFocus
                            value={renamingTplValue}
                            onChange={(e) => setRenamingTplValue(e.target.value)}
                            onBlur={() => handleCommitRenamePreloaded(tpl.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCommitRenamePreloaded(tpl.id);
                              if (e.key === "Escape") {
                                setRenamingTplId(null);
                                setRenamingTplValue("");
                              }
                            }}
                            className="w-full px-2 py-0.5 text-xs font-semibold text-neutral-900 bg-white border border-neutral-900 rounded focus:outline-none"
                          />
                        ) : (
                          <p className="text-xs font-semibold text-neutral-900 truncate">
                            {tpl.name}
                          </p>
                        )}
                        <p className="font-mono text-[10px] text-neutral-400 truncate">
                          {tpl.fileName} · {formatFileSize(tpl.fileSizeBytes)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingTplId(tpl.id);
                          setRenamingTplValue(tpl.name);
                        }}
                        title="Rename template"
                        className="p-1.5 text-neutral-400 hover:text-neutral-800 rounded-md hover:bg-white transition-colors active:scale-95 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={downloadingTplId === tpl.id}
                        onClick={() => handleDownloadPreloaded(tpl)}
                        title="Download PDF"
                        className="p-1.5 text-neutral-400 hover:text-neutral-800 rounded-md hover:bg-white transition-colors active:scale-95 cursor-pointer disabled:opacity-40"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreloaded(tpl.id)}
                        title="Delete template"
                        className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors active:scale-95 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showImporter ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold text-neutral-900">
                {activeIsEmpty
                  ? `Upload LaTeX for "${activeResume?.name?.trim() || "New Master Resume"}"`
                  : `Replace LaTeX for "${activeResume?.name?.trim() || "Master Resume"}"`}
              </p>
              <p className="text-[11px] text-neutral-500">
                Upload a .tex file or paste your LaTeX source to populate this master resume slot.
              </p>
            </div>
            <ResumeImporter
              onParsed={handleParsed}
              onCancel={
                !activeIsEmpty
                  ? () => setImporting(false)
                  : resumes.length > 1 && activeResume?.id
                  ? () => handleDeleteResume(activeResume.id!)
                  : undefined
              }
            />
          </div>
        ) : (
          activeResume && (
            <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-8">
              <aside className="hidden lg:block">
                <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
                  <ResumeTree resume={activeResume} />
                </div>
              </aside>

              <div className="space-y-8 min-w-0">
                <CalibrationBar />
                {hasResumeSection(activeResume, "contact") && (
                  <ContactSection
                    contact={activeResume.contact}
                    onChange={(contact) => update({ contact })}
                  />
                )}
                {hasResumeSection(activeResume, "education") && (
                  <EducationSection
                    items={activeResume.education}
                    onChange={(education) => update({ education })}
                  />
                )}
                {hasResumeSection(activeResume, "skills") && (
                  <SkillsSection
                    categories={activeResume.skills}
                    onChange={(skills) => update({ skills })}
                  />
                )}
                {hasResumeSection(activeResume, "experience") && (
                  <ExperienceSection
                    jobs={activeResume.experience}
                    known={known}
                    onChange={(experience) => update({ experience })}
                  />
                )}
                {hasResumeSection(activeResume, "projects") && (
                  <ProjectsSection
                    projects={activeResume.projects}
                    known={known}
                    onChange={(projects) => update({ projects })}
                  />
                )}
                {hasResumeSection(activeResume, "awards") && (
                  <AwardsSection
                    awards={activeResume.awards ?? []}
                    onChange={(awards) => update({ awards })}
                  />
                )}
              </div>
            </div>
          )
        )}

        {exportModalOpen && activeResume && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4 animate-fadeIn"
            onClick={() => !exporting && setExportModalOpen(false)}
          >
            <form
              onSubmit={handleConfirmExport}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-[#ebebeb] bg-white p-5 shadow-modal space-y-4 animate-scaleIn"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">Export Resume PDF</h2>
                <span className="font-mono text-[10px] text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-[#ebebeb]">
                  {fmt.paperSize.toUpperCase()} · {fmt.baseFontSizePt}pt {fmt.fontFamily}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-neutral-600">
                  File Name
                </label>
                <div className="flex items-center rounded-md border border-[#ebebeb] bg-[#fafafa] px-3 py-2 focus-within:border-neutral-900 focus-within:bg-white transition-colors">
                  <input
                    type="text"
                    autoFocus
                    disabled={exporting}
                    value={exportName}
                    onChange={(e) => setExportName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && !exporting) setExportModalOpen(false);
                    }}
                    placeholder="Resume_Name"
                    className="w-full bg-transparent text-xs font-mono text-neutral-900 focus:outline-none disabled:opacity-50"
                  />
                  <span className="text-xs font-mono text-neutral-400 select-none pl-1">
                    .pdf
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] rounded px-1.5 py-0.5">
                  margins {fmt.margins.topIn.toFixed(2)}in / {fmt.margins.leftIn.toFixed(2)}in
                </span>
                <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] rounded px-1.5 py-0.5">
                  linespread {fmt.lineSpread}
                </span>
                {fmt.headerStyle.showIcons && (
                  <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] rounded px-1.5 py-0.5">
                    fontawesome5 icons
                  </span>
                )}
                {fmt.sectionStyle.hasRule && (
                  <span className="font-mono text-[10px] text-neutral-500 bg-[#fafafa] border border-[#ebebeb] rounded px-1.5 py-0.5">
                    {fmt.sectionStyle.ruleHeightPt}pt rule
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#ebebeb]">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => {
                    downloadResumeTex(activeResume, exportName || "Resume");
                    if (user) {
                      void saveMasterResumes(user.uid, {
                        resumes,
                        activeResumeId: activeResume.id || activeResumeId,
                      });
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-mono text-neutral-600 hover:text-neutral-900 bg-[#fafafa] hover:bg-neutral-100 border border-[#ebebeb] rounded-full transition-colors active:scale-95 cursor-pointer disabled:opacity-40"
                >
                  .tex
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => setExportModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!exportName.trim() || exporting}
                    className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
                  >
                    {exporting ? "Compiling PDF..." : "Download PDF"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Preloaded Resume Template Upload Modal */}
        {preloadedModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4 animate-fadeIn"
            onClick={() => !uploadingTemplate && setPreloadedModalOpen(false)}
          >
            <form
              onSubmit={handleConfirmUploadPreloaded}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl border border-[#ebebeb] shadow-modal p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-neutral-900 tracking-tight">
                    Add Preloaded Resume Template
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Upload a ready-to-send <span className="font-mono">.pdf</span> or{" "}
                    <span className="font-mono">.tex</span> resume to select and push directly to Agents from Preview.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={uploadingTemplate}
                  onClick={() => setPreloadedModalOpen(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
                    Resume File (.pdf or .tex)
                  </label>
                  <input
                    ref={preloadedFileInputRef}
                    type="file"
                    accept=".pdf,.tex,application/pdf,application/x-tex"
                    onChange={(e) => handlePreloadedFileSelect(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => preloadedFileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-1.5 px-4 py-5 rounded-xl border border-dashed border-neutral-300 bg-[#fafafa] hover:bg-neutral-100/70 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-neutral-500" />
                    {uploadFile ? (
                      <div className="text-center">
                        <p className="text-xs font-semibold text-neutral-900">{uploadFile.name}</p>
                        <p className="font-mono text-[10px] text-neutral-500">
                          {formatFileSize(uploadFile.size)}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs font-medium text-neutral-700">
                          Choose a PDF or LaTeX (.tex) file
                        </p>
                        <p className="font-mono text-[10px] text-neutral-400">Max 4 MB</p>
                      </div>
                    )}
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="preloaded-template-label"
                    className="block font-mono text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5"
                  >
                    Template Name
                  </label>
                  <input
                    id="preloaded-template-label"
                    type="text"
                    required
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    placeholder="e.g. Backend SWE General, ML Research v2"
                    className="w-full px-3 py-2 text-xs text-neutral-900 bg-white border border-[#ebebeb] rounded-lg focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                </div>

                {uploadError && (
                  <p className="text-xs text-red-600 font-medium">{uploadError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#ebebeb]">
                <button
                  type="button"
                  disabled={uploadingTemplate}
                  onClick={() => setPreloadedModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || !uploadLabel.trim() || uploadingTemplate}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingTemplate ? "Saving..." : "Save Template"}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </CalibrationProvider>
  );
}
