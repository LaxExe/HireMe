"use client";

import React, { useState } from "react";
import { ExternalLink, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onChange,
  onDelete,
}: {
  project: Project;
  known: string[];
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onChange: (p: Project) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingLink, setAddingLink] = useState(false);

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
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`scroll-mt-20 bg-white rounded-xl border transition-all duration-150 shadow-subtle overflow-hidden ${
        isDragging
          ? "opacity-40 border-neutral-400"
          : isDropTarget
          ? "border-neutral-900 ring-1 ring-neutral-900/10"
          : "border-[#ebebeb]"
      }`}
    >
      <header className="px-4 py-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 min-w-0">
            <span
              className="mt-0.5 text-neutral-300 hover:text-neutral-600 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
              title="Drag to reorder project"
            >
              <GripVertical className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight text-neutral-900 min-w-0 flex items-center gap-1.5 flex-wrap">
                {project.url ? (
                  <a
                    href={project.url.startsWith("http") ? project.url : `https://${project.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 hover:underline decoration-blue-200 underline-offset-2"
                  >
                    <span>{project.name}</span>
                    <ExternalLink className="w-3 h-3 text-blue-600" />
                  </a>
                ) : (
                  <span>{project.name}</span>
                )}
                {project.links &&
                  project.links.map((l) => {
                    const isGh =
                      l.icon === "\\faGithub" ||
                      /github\.com/i.test(l.url) ||
                      /^github$/i.test(l.label);
                    return (
                      <a
                        key={`hdr-${l.id}`}
                        href={l.url.startsWith("http") ? l.url : `https://${l.url}`}
                        target="_blank"
                        rel="noreferrer"
                        title={l.label || l.url}
                        className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 transition-colors"
                      >
                        {isGh ? (
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          >
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                          </svg>
                        ) : (
                          <ExternalLink className="w-3 h-3" />
                        )}
                      </a>
                    );
                  })}
              </h3>
            </div>
          </div>
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

        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {project.links &&
            project.links.map((l) => (
              <Chip
                key={l.id}
                variant="skill"
                onRemove={() =>
                  onChange({
                    ...project,
                    links: project.links?.filter((x) => x.id !== l.id),
                  })
                }
              >
                <a
                  href={l.url.startsWith("http") ? l.url : `https://${l.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline font-mono text-[11px]"
                >
                  {l.label}
                </a>
              </Chip>
            ))}
          <button
            type="button"
            onClick={() => setAddingLink(true)}
            className="inline-flex items-center gap-1 text-[11px] leading-none px-2 py-1 rounded-full border border-dashed border-[#d4d4d4] text-neutral-500 hover:text-neutral-900 hover:border-neutral-900 transition-colors active:scale-95 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Link</span>
          </button>
        </div>

        {addingLink && (
          <div className="pl-6 pt-1">
            <FieldEditor
              fields={[
                { key: "label", label: "Label (e.g. GitHub, Write-up, Demo)", value: "", required: true },
                { key: "url", label: "URL", value: "", mono: true, required: true },
              ]}
              submitLabel="Add Link"
              onCancel={() => setAddingLink(false)}
              onSave={(v) => {
                onChange({
                  ...project,
                  links: [
                    ...(project.links || []),
                    { id: uid("l"), label: v.label, url: v.url },
                  ],
                });
                setAddingLink(false);
              }}
            />
          </div>
        )}

        {project.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-6">
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
  const [draggedProjId, setDraggedProjId] = useState<string | null>(null);
  const [dropTargetProjId, setDropTargetProjId] = useState<string | null>(null);

  const handleProjectDrop = (targetId: string) => {
    if (!draggedProjId || draggedProjId === targetId) {
      setDraggedProjId(null);
      setDropTargetProjId(null);
      return;
    }
    const srcIdx = projects.findIndex((p) => p.id === draggedProjId);
    const dstIdx = projects.findIndex((p) => p.id === targetId);
    if (srcIdx >= 0 && dstIdx >= 0) {
      const next = [...projects];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      onChange(next);
    }
    setDraggedProjId(null);
    setDropTargetProjId(null);
  };

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
          isDragging={draggedProjId === p.id}
          isDropTarget={dropTargetProjId === p.id && draggedProjId !== p.id}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDraggedProjId(p.id);
          }}
          onDragOver={(e) => {
            if (!draggedProjId) return;
            e.preventDefault();
            if (dropTargetProjId !== p.id) setDropTargetProjId(p.id);
          }}
          onDrop={(e) => {
            if (!draggedProjId) return;
            e.preventDefault();
            handleProjectDrop(p.id);
          }}
          onDragEnd={() => {
            setDraggedProjId(null);
            setDropTargetProjId(null);
          }}
          onChange={(next) => onChange(projects.map((x) => (x.id === p.id ? next : x)))}
          onDelete={() => onChange(projects.filter((x) => x.id !== p.id))}
        />
      ))}
    </section>
  );
}
