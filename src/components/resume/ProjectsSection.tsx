"use client";

import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Project } from "@/lib/resume/types";
import { splitItems, uid } from "@/lib/resume/utils";
import BulletList from "./BulletList";
import Chip from "./Chip";
import FieldEditor from "./FieldEditor";

const projectFields = (p?: Project) => [
  { key: "name", label: "Name", value: p?.name ?? "", required: true, wide: true },
  { key: "url", label: "Link", value: p?.url ?? "", mono: true },
  { key: "meta", label: "Type", value: p?.meta ?? "" },
  { key: "techStack", label: "Tech stack", value: p?.techStack.join(", ") ?? "", wide: true },
];

function ProjectCard({
  project,
  known,
  onChange,
  onDelete,
}: {
  project: Project;
  known: string[];
  onChange: (p: Project) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div id={`proj-${project.id}`} className="scroll-mt-20">
        <FieldEditor
          fields={projectFields(project)}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            onChange({
              ...project,
              name: v.name,
              url: v.url,
              meta: v.meta,
              techStack: splitItems(v.techStack),
            });
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <article
      id={`proj-${project.id}`}
      className="scroll-mt-20 bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden"
    >
      <header className="px-4 py-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-sm font-semibold tracking-tight text-neutral-900 min-w-0">
            {project.url ? (
              <a
                href={project.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline decoration-[#ebebeb] underline-offset-2"
              >
                {project.name}
              </a>
            ) : (
              project.name
            )}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {project.meta && (
              <span className="text-[11px] font-mono text-neutral-500 mr-1">{project.meta}</span>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors active:scale-95 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {project.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.techStack.map((t) => (
              <Chip key={t} variant="skill">
                {t}
              </Chip>
            ))}
          </div>
        )}
      </header>
      <div className="bg-[#fafafa] border-t border-[#ebebeb] p-3">
        <BulletList
          bullets={project.bullets}
          known={known}
          onChange={(bullets) => onChange({ ...project, bullets })}
        />
      </div>
    </article>
  );
}

export default function ProjectsSection({
  projects,
  known,
  onChange,
}: {
  projects: Project[];
  known: string[];
  onChange: (projects: Project[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section id="sec-projects" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900 lowercase">
          projects{" "}
          <span className="font-mono text-[11px] text-neutral-400 ml-1">{projects.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Project</span>
        </button>
      </div>

      {adding && (
        <FieldEditor
          fields={projectFields()}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            onChange([
              {
                id: uid("p"),
                name: v.name,
                url: v.url,
                meta: v.meta,
                techStack: splitItems(v.techStack),
                bullets: [],
              },
              ...projects,
            ]);
            setAdding(false);
          }}
        />
      )}

      {projects.length === 0 && !adding && (
        <p className="text-xs text-neutral-400 font-mono py-8 text-center">no projects</p>
      )}

      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          known={known}
          onChange={(next) => onChange(projects.map((x) => (x.id === p.id ? next : x)))}
          onDelete={() => onChange(projects.filter((x) => x.id !== p.id))}
        />
      ))}
    </section>
  );
}
