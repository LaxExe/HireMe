"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { loadMasterResume, saveMasterResume, subscribeMasterResume } from "@/lib/resume/store";
import { knownTools } from "@/lib/resume/utils";
import {
  DEFAULT_RESUME_FORMAT,
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

  const [resume, setResume] = useState<MasterResume | null>(null);
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exporting, setExporting] = useState(false);
  const skipSave = useRef(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Load and subscribe to live master resume changes across devices
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeMasterResume(user.uid, (saved) => {
      skipSave.current = true;
      setResume(saved);
      setReady(true);
    });
    return () => {
      unsubscribe();
    };
  }, [user]);

  // Debounced autosave.
  useEffect(() => {
    if (!user || !resume || !ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const t = setTimeout(() => saveMasterResume(user.uid, resume), 400);
    return () => clearTimeout(t);
  }, [resume, user, ready]);

  const update = useCallback(
    (patch: Partial<MasterResume>) =>
      setResume((prev) => (prev ? { ...prev, ...patch, updatedAt: new Date().toISOString() } : prev)),
    []
  );

  const known = useMemo(
    () =>
      resume
        ? knownTools(
            resume.skills.flatMap((c) => c.skills.map((s) => s.name)),
            resume.projects.map((p) => p.techStack)
          )
        : [],
    [resume]
  );

  if (loading || !user || !ready) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  const handleParsed = (parsed: MasterResume) => {
    skipSave.current = false;
    setResume(parsed);
    setImporting(false);
    saveMasterResume(user.uid, parsed);
  };

  const openExportModal = () => {
    if (!resume) return;
    const defaultBase = resume.contact.name
      ? `${resume.contact.name.trim().replace(/\s+/g, "_")}_Resume`
      : "Resume";
    setExportName(defaultBase);
    setExportModalOpen(true);
  };

  const handleConfirmExport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resume || exporting) return;
    setExporting(true);
    try {
      await downloadResumePdf(resume, exportName || "Resume");
      setExportModalOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const showImporter = !resume || importing;
  const fmt = resume?.format ?? DEFAULT_RESUME_FORMAT;

  return (
    <CalibrationProvider
      initialCalibration={resume?.calibration}
      onCalibrationChange={(cal) => update({ calibration: cal })}
    >
      <div className="flex-1 py-8 sm:py-12 space-y-6 pb-24 sm:pb-12 animate-fadeIn">
        <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            experience
          </h1>
          {resume && !importing && (
            <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>

        {showImporter ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <ResumeImporter
              onParsed={handleParsed}
              onCancel={resume ? () => setImporting(false) : undefined}
            />
          </div>
        ) : (
          resume && (
            <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-8">
              <aside className="hidden lg:block">
                <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
                  <ResumeTree resume={resume} />
                </div>
              </aside>

              <div className="space-y-8 min-w-0">
                <CalibrationBar />
                {hasResumeSection(resume, "contact") && (
                  <ContactSection contact={resume.contact} onChange={(contact) => update({ contact })} />
                )}
                {hasResumeSection(resume, "education") && (
                  <EducationSection items={resume.education} onChange={(education) => update({ education })} />
                )}
                {hasResumeSection(resume, "skills") && (
                  <SkillsSection categories={resume.skills} onChange={(skills) => update({ skills })} />
                )}
                {hasResumeSection(resume, "experience") && (
                  <ExperienceSection
                    jobs={resume.experience}
                    known={known}
                    onChange={(experience) => update({ experience })}
                  />
                )}
                {hasResumeSection(resume, "projects") && (
                  <ProjectsSection
                    projects={resume.projects}
                    known={known}
                    onChange={(projects) => update({ projects })}
                  />
                )}
                {hasResumeSection(resume, "awards") && (
                  <AwardsSection
                    awards={resume.awards ?? []}
                    onChange={(awards) => update({ awards })}
                  />
                )}
              </div>
            </div>
          )
        )}

        {exportModalOpen && resume && (
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
                  Resume Name
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
                  onClick={() => downloadResumeTex(resume, exportName || "Resume")}
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
      </div>
    </CalibrationProvider>
  );
}
