"use client";

import React, { useState } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
