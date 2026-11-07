"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SkillCategory } from "@/lib/resume/types";
import { splitItems, uid } from "@/lib/resume/utils";
import Chip from "./Chip";

function CategoryCard({
  category,
  onChange,
  onDelete,
}: {
  category: SkillCategory;
  onChange: (c: SkillCategory) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const existing = new Set(category.skills.map((s) => s.name.toLowerCase()));
    const fresh = splitItems(draft)
      .filter((n) => !existing.has(n.toLowerCase()))
      .map((name) => ({ id: uid("s"), name }));
    if (fresh.length) onChange({ ...category, skills: [...category.skills, ...fresh] });
    setDraft("");
  };

  return (
    <div
      id={`cat-${category.id}`}
      className="scroll-mt-20 bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-tight text-neutral-900">
          {category.name}{" "}
          <span className="font-mono text-[11px] text-neutral-400 ml-1">{category.skills.length}</span>
        </h3>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors active:scale-95 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {category.skills.map((s) => (
          <Chip
            key={s.id}
            variant="skill"
            onRemove={() =>
              onChange({ ...category, skills: category.skills.filter((x) => x.id !== s.id) })
            }
          >
            {s.name}
          </Chip>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder="add"
          className="w-16 focus:w-32 transition-all duration-150 text-[11px] px-2 py-1 bg-transparent rounded-full border border-dashed border-[#d4d4d4] focus:border-neutral-900 focus:outline-none placeholder:text-neutral-400"
        />
      </div>
    </div>
  );
}

export default function SkillsSection({
  categories,
  onChange,
}: {
  categories: SkillCategory[];
  onChange: (c: SkillCategory[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const total = categories.reduce((n, c) => n + c.skills.length, 0);

  const addCategory = () => {
    const n = name.trim();
    if (n) onChange([...categories, { id: uid("c"), name: n, skills: [] }]);
    setName("");
    setAdding(false);
  };

  return (
    <section id="sec-skills" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900 lowercase">
          skills <span className="font-mono text-[11px] text-neutral-400 ml-1">{total}</span>
        </h2>
        {adding ? (
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCategory();
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={addCategory}
            placeholder="Category"
            className="w-40 px-3 py-1.5 text-xs bg-white border border-neutral-900 rounded-full focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Category</span>
          </button>
        )}
      </div>

      {categories.length === 0 && (
        <p className="text-xs text-neutral-400 font-mono py-8 text-center">no skills</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            onChange={(next) => onChange(categories.map((x) => (x.id === c.id ? next : x)))}
            onDelete={() => onChange(categories.filter((x) => x.id !== c.id))}
          />
        ))}
      </div>
    </section>
  );
}
