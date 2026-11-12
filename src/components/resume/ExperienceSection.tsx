"use client";

import React, { useState } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { Job } from "@/lib/resume/types";
import { uid } from "@/lib/resume/utils";
import { useCalibration } from "@/context/CalibrationContext";
import BulletList from "./BulletList";
import FieldEditor from "./FieldEditor";

const jobFields = (j?: Job) => [
  { key: "title", label: "Title", value: j?.title ?? "", required: true, wide: true },
  { key: "company", label: "Company", value: j?.company ?? "", required: true },
  { key: "companyUrl", label: "Link", value: j?.companyUrl ?? "", mono: true },
  { key: "location", label: "Location", value: j?.location ?? "" },
  { key: "dates", label: "Dates", value: j?.dates ?? "", mono: true },
];

function JobCard({
  job,
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
  job: Job;
  known: string[];
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onChange: (j: Job) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div id={`job-${job.id}`} className="scroll-mt-20">
        <FieldEditor
          fields={jobFields(job)}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            onChange({ ...job, ...v });
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <article
      id={`job-${job.id}`}
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
      <header className="flex items-start justify-between gap-4 px-4 py-3.5">
        <div className="flex items-start gap-2 min-w-0">
          <span
            className="mt-0.5 text-neutral-300 hover:text-neutral-600 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
            title="Drag to reorder role"
          >
            <GripVertical className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-neutral-900">{job.title}</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {job.companyUrl ? (
                <a
                  href={job.companyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-700 hover:text-neutral-900 underline decoration-[#ebebeb] underline-offset-2"
                >
                  {job.company}
                </a>
              ) : (
                <span className="text-neutral-700">{job.company}</span>
              )}
              {job.location && <span> · {job.location}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[11px] font-mono text-neutral-500 mr-1">{job.dates}</span>
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
      </header>
      <div className="bg-[#fafafa] border-t border-[#ebebeb] p-3">
        <BulletList
          bullets={job.bullets}
          known={known}
          onChange={(bullets) => onChange({ ...job, bullets })}
        />
      </div>
    </article>
  );
}

export default function ExperienceSection({
  jobs,
  known,
  onChange,
}: {
  jobs: Job[];
  known: string[];
  onChange: (jobs: Job[]) => void;
}) {
  const { calibration, setMalleableLines } = useCalibration();
  const [adding, setAdding] = useState(false);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dropTargetJobId, setDropTargetJobId] = useState<string | null>(null);

  const handleJobDrop = (targetId: string) => {
    if (!draggedJobId || draggedJobId === targetId) {
      setDraggedJobId(null);
      setDropTargetJobId(null);
      return;
    }
    const srcIdx = jobs.findIndex((j) => j.id === draggedJobId);
    const dstIdx = jobs.findIndex((j) => j.id === targetId);
    if (srcIdx >= 0 && dstIdx >= 0) {
      const next = [...jobs];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      onChange(next);
    }
    setDraggedJobId(null);
    setDropTargetJobId(null);
  };

  return (
    <section id="sec-experience" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold tracking-tight text-neutral-900 lowercase">
            experience{" "}
            <span className="font-mono text-[11px] text-neutral-400 ml-1">{jobs.length}</span>
          </h2>
          <label
            htmlFor="exp-malleable-lines"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#ebebeb] shadow-2xs text-[11px] font-mono text-neutral-600"
          >
            <span>malleable lines:</span>
            <input
              id="exp-malleable-lines"
              type="number"
              min={0}
              max={6}
              value={calibration.malleableLines ?? 1}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed) && parsed >= 0) {
                  setMalleableLines(parsed);
                }
              }}
              className="w-9 bg-[#fafafa] border border-[#ebebeb] rounded px-1 py-0.5 text-center font-mono text-[11px] text-neutral-900 focus:outline-none focus:border-neutral-400"
            />
            <span className="text-[10px] text-neutral-400">1L larp</span>
          </label>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Job</span>
        </button>
      </div>

      {adding && (
        <FieldEditor
          fields={jobFields()}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            onChange([
              {
                id: uid("j"),
                title: v.title,
                company: v.company,
                companyUrl: v.companyUrl,
                location: v.location,
                dates: v.dates,
                bullets: [],
              },
              ...jobs,
            ]);
            setAdding(false);
          }}
        />
      )}

      {jobs.length === 0 && !adding && (
        <p className="text-xs text-neutral-400 font-mono py-8 text-center">no jobs</p>
      )}

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          known={known}
          isDragging={draggedJobId === job.id}
          isDropTarget={dropTargetJobId === job.id && draggedJobId !== job.id}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDraggedJobId(job.id);
          }}
          onDragOver={(e) => {
            if (!draggedJobId) return;
            e.preventDefault();
            if (dropTargetJobId !== job.id) setDropTargetJobId(job.id);
          }}
          onDrop={(e) => {
            if (!draggedJobId) return;
            e.preventDefault();
            handleJobDrop(job.id);
          }}
          onDragEnd={() => {
            setDraggedJobId(null);
            setDropTargetJobId(null);
          }}
          onChange={(next) => onChange(jobs.map((j) => (j.id === job.id ? next : j)))}
          onDelete={() => onChange(jobs.filter((j) => j.id !== job.id))}
        />
      ))}
    </section>
  );
}
