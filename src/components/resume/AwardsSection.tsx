"use client";

import React, { useState } from "react";
import { Award as AwardIcon, Pencil, Plus, Trash2 } from "lucide-react";
import type { Award } from "@/lib/resume/types";
import { uid } from "@/lib/resume/utils";
import FieldEditor from "./FieldEditor";

const awardFields = (a?: Award) => [
  { key: "title", label: "Award / Scholarship", value: a?.title ?? "", required: true, wide: true },
  { key: "date", label: "Date", value: a?.date ?? "", mono: true },
  { key: "description", label: "Description / Achievement", value: a?.description ?? "", wide: true },
];

function AwardCard({
  award,
  onChange,
  onDelete,
}: {
  award: Award;
  onChange: (a: Award) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div id={`award-${award.id}`} className="scroll-mt-20">
        <FieldEditor
          fields={awardFields(award)}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            onChange({
              ...award,
              title: v.title,
              date: v.date,
              description: v.description,
            });
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <article
      id={`award-${award.id}`}
      className="scroll-mt-20 bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-2"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AwardIcon className="w-4 h-4 text-neutral-500 flex-shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight text-neutral-900">{award.title}</h3>
          </div>
          {award.description && (
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed pl-6">
              {award.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {award.date && (
            <span className="text-[11px] font-mono text-neutral-500 mr-1">{award.date}</span>
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
      </header>
    </article>
  );
}

export default function AwardsSection({
  awards,
  onChange,
}: {
  awards: Award[];
  onChange: (awards: Award[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section id="sec-awards" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900 lowercase">
          scholarships & awards{" "}
          <span className="font-mono text-[11px] text-neutral-400 ml-1">{awards.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Award</span>
        </button>
      </div>

      {adding && (
        <FieldEditor
          fields={awardFields()}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            onChange([
              {
                id: uid("a"),
                title: v.title,
                date: v.date,
                description: v.description,
              },
              ...awards,
            ]);
            setAdding(false);
          }}
        />
      )}

      {awards.length === 0 && !adding && (
        <p className="text-xs text-neutral-400 font-mono py-8 text-center">no awards</p>
      )}

      {awards.map((award) => (
        <AwardCard
          key={award.id}
          award={award}
          onChange={(next) => onChange(awards.map((a) => (a.id === award.id ? next : a)))}
          onDelete={() => onChange(awards.filter((a) => a.id !== award.id))}
        />
      ))}
    </section>
  );
}
