"use client";

import React from "react";
import { hasResumeSection, type MasterResume } from "@/lib/resume/types";

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Node({
  label,
  count,
  target,
  strong,
}: {
  label: string;
  count?: number;
  target: string;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => jump(target)}
      className={`w-full flex items-center justify-between gap-2 text-left text-xs py-1 rounded transition-colors hover:text-neutral-900 active:scale-95 cursor-pointer ${
        strong ? "font-semibold text-neutral-900" : "text-neutral-500"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[10px] text-neutral-400 flex-shrink-0">{count}</span>
      )}
    </button>
  );
}

function Branch({ children }: { children: React.ReactNode }) {
  return <div className="ml-1 pl-3 border-l border-[#ebebeb]">{children}</div>;
}

export default function ResumeTree({ resume }: { resume: MasterResume }) {
  const skillTotal = resume.skills.reduce((n, c) => n + c.skills.length, 0);

  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold tracking-tight text-neutral-900 lowercase pb-1">
        master resume
      </p>
      <Branch>
        {hasResumeSection(resume, "contact") && (
          <Node label="contact" target="sec-contact" strong />
        )}

        {hasResumeSection(resume, "education") && (
          <Node label="education" count={resume.education.length} target="sec-education" strong />
        )}

        {hasResumeSection(resume, "skills") && (
          <>
            <Node label="skills" count={skillTotal} target="sec-skills" strong />
            <Branch>
              {resume.skills.map((c) => (
                <Node key={c.id} label={c.name} count={c.skills.length} target={`cat-${c.id}`} />
              ))}
            </Branch>
          </>
        )}

        {hasResumeSection(resume, "experience") && (
          <>
            <Node label="experience" count={resume.experience.length} target="sec-experience" strong />
            <Branch>
              {resume.experience.map((j) => (
                <Node key={j.id} label={j.company || j.title} count={j.bullets.length} target={`job-${j.id}`} />
              ))}
            </Branch>
          </>
        )}

        {hasResumeSection(resume, "projects") && (
          <>
            <Node label="projects" count={resume.projects.length} target="sec-projects" strong />
            <Branch>
              {resume.projects.map((p) => (
                <Node key={p.id} label={p.name} count={p.bullets.length} target={`proj-${p.id}`} />
              ))}
            </Branch>
          </>
        )}

        {hasResumeSection(resume, "awards") && (
          <>
            <Node label="awards" count={(resume.awards ?? []).length} target="sec-awards" strong />
            <Branch>
              {(resume.awards ?? []).map((a) => (
                <Node key={a.id} label={a.title} target={`award-${a.id}`} />
              ))}
            </Branch>
          </>
        )}
      </Branch>
    </nav>
  );
}
