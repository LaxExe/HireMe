"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { loadMasterResume, saveMasterResume } from "@/lib/resume/store";
import { knownTools } from "@/lib/resume/utils";
import type { MasterResume } from "@/lib/resume/types";
import ResumeImporter from "@/components/resume/ResumeImporter";
import ResumeTree from "@/components/resume/ResumeTree";
import CalibrationBar from "@/components/resume/CalibrationBar";
import { CalibrationProvider } from "@/context/CalibrationContext";
import { ContactSection, EducationSection } from "@/components/resume/ContactAndEducation";
import SkillsSection from "@/components/resume/SkillsSection";
import ExperienceSection from "@/components/resume/ExperienceSection";
import ProjectsSection from "@/components/resume/ProjectsSection";

export default function ExperiencePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [resume, setResume] = useState<MasterResume | null>(null);
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const skipSave = useRef(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Load the saved master resume (Firestore or local database).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadMasterResume(user.uid).then((saved) => {
      if (cancelled) return;
      skipSave.current = true;
      setResume(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
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

  const showImporter = !resume || importing;

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
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              Replace .tex
            </button>
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
                <ContactSection contact={resume.contact} onChange={(contact) => update({ contact })} />
                <EducationSection items={resume.education} onChange={(education) => update({ education })} />
                <SkillsSection categories={resume.skills} onChange={(skills) => update({ skills })} />
                <ExperienceSection
                  jobs={resume.experience}
                  known={known}
                  onChange={(experience) => update({ experience })}
                />
                <ProjectsSection
                  projects={resume.projects}
                  known={known}
                  onChange={(projects) => update({ projects })}
                />
              </div>
            </div>
          )
        )}
      </div>
    </CalibrationProvider>
  );
}
