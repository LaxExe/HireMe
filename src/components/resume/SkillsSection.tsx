"use client";

import React, { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { SkillCategory } from "@/lib/resume/types";
import { uid } from "@/lib/resume/utils";
import Chip from "./Chip";

interface DraggedSkillState {
  categoryId: string;
  skillId: string;
}

function splitSkillDraft(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === ",") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function CategoryCard({
  category,
  draggedSkill,
  onSkillDragStart,
  onSkillDropOnSkill,
  onSkillDropOnCategory,
  onSkillDragEnd,
  isCategoryDragging,
  isCategoryDropTarget,
  onCategoryDragStart,
  onCategoryDragOver,
  onCategoryDrop,
  onCategoryDragEnd,
  onChange,
  onDelete,
}: {
  category: SkillCategory;
  draggedSkill: DraggedSkillState | null;
  onSkillDragStart: (categoryId: string, skillId: string) => void;
  onSkillDropOnSkill: (targetCategoryId: string, targetSkillId: string) => void;
  onSkillDropOnCategory: (targetCategoryId: string) => void;
  onSkillDragEnd: () => void;
  isCategoryDragging: boolean;
  isCategoryDropTarget: boolean;
  onCategoryDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onCategoryDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onCategoryDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onCategoryDragEnd: () => void;
  onChange: (c: SkillCategory) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [dropTargetSkillId, setDropTargetSkillId] = useState<string | null>(null);

  const add = () => {
    const existing = new Set(category.skills.map((s) => s.name.toLowerCase()));
    const fresh = splitSkillDraft(draft)
      .filter((n) => !existing.has(n.toLowerCase()))
      .map((name) => ({ id: uid("s"), name }));
    if (fresh.length) onChange({ ...category, skills: [...category.skills, ...fresh] });
    setDraft("");
  };

  return (
    <div
      id={`cat-${category.id}`}
      draggable={!draggedSkill}
      onDragStart={(e) => {
        if (draggedSkill) return;
        onCategoryDragStart(e);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedSkill) return;
        onCategoryDragOver(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropTargetSkillId(null);
        if (draggedSkill) {
          onSkillDropOnCategory(category.id);
        } else {
          onCategoryDrop(e);
        }
      }}
      onDragEnd={() => {
        setDropTargetSkillId(null);
        onCategoryDragEnd();
      }}
      className={`scroll-mt-20 bg-white rounded-xl border transition-all duration-150 shadow-subtle p-4 space-y-3 ${
        isCategoryDragging
          ? "opacity-40 border-neutral-400"
          : isCategoryDropTarget
          ? "border-neutral-900 ring-1 ring-neutral-900/10"
          : "border-[#ebebeb]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-neutral-300 hover:text-neutral-600 cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reorder category"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          <h3 className="text-xs font-semibold tracking-tight text-neutral-900 truncate">
            {category.name}{" "}
            <span className="font-mono text-[11px] text-neutral-400 ml-1">
              {category.skills.length}
            </span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors active:scale-95 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {category.skills.map((s) => {
          const isBeingDragged =
            draggedSkill?.categoryId === category.id && draggedSkill?.skillId === s.id;
          const isDropTarget = dropTargetSkillId === s.id && !isBeingDragged;
          return (
            <Chip
              key={s.id}
              variant="skill"
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                onSkillDragStart(category.id, s.id);
              }}
              onDragOver={(e) => {
                if (!draggedSkill) return;
                e.preventDefault();
                e.stopPropagation();
                if (dropTargetSkillId !== s.id) setDropTargetSkillId(s.id);
              }}
              onDrop={(e) => {
                if (!draggedSkill) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTargetSkillId(null);
                onSkillDropOnSkill(category.id, s.id);
              }}
              onDragEnd={() => {
                setDropTargetSkillId(null);
                onSkillDragEnd();
              }}
              className={
                isBeingDragged
                  ? "opacity-35 border-dashed border-neutral-400"
                  : isDropTarget
                  ? "border-neutral-900 bg-neutral-100"
                  : "hover:border-neutral-400"
              }
              onRemove={() =>
                onChange({ ...category, skills: category.skills.filter((x) => x.id !== s.id) })
              }
            >
              {s.name}
            </Chip>
          );
        })}
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
  const [draggedSkill, setDraggedSkill] = useState<DraggedSkillState | null>(null);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dropTargetCatId, setDropTargetCatId] = useState<string | null>(null);

  const total = categories.reduce((n, c) => n + c.skills.length, 0);

  const addCategory = () => {
    const n = name.trim();
    if (n) onChange([...categories, { id: uid("c"), name: n, skills: [] }]);
    setName("");
    setAdding(false);
  };

  const handleSkillDropOnSkill = (targetCategoryId: string, targetSkillId: string) => {
    if (!draggedSkill) return;
    const { categoryId: srcCatId, skillId: srcSkillId } = draggedSkill;
    if (srcCatId === targetCategoryId && srcSkillId === targetSkillId) {
      setDraggedSkill(null);
      return;
    }

    const srcCat = categories.find((c) => c.id === srcCatId);
    const movingSkill = srcCat?.skills.find((s) => s.id === srcSkillId);
    if (!movingSkill) {
      setDraggedSkill(null);
      return;
    }

    if (srcCatId === targetCategoryId) {
      const nextSkills = srcCat!.skills.filter((s) => s.id !== srcSkillId);
      const targetIdx = nextSkills.findIndex((s) => s.id === targetSkillId);
      nextSkills.splice(targetIdx >= 0 ? targetIdx : nextSkills.length, 0, movingSkill);
      onChange(categories.map((c) => (c.id === srcCatId ? { ...c, skills: nextSkills } : c)));
    } else {
      onChange(
        categories.map((c) => {
          if (c.id === srcCatId) {
            return { ...c, skills: c.skills.filter((s) => s.id !== srcSkillId) };
          }
          if (c.id === targetCategoryId) {
            const nextSkills = [...c.skills];
            const targetIdx = nextSkills.findIndex((s) => s.id === targetSkillId);
            nextSkills.splice(targetIdx >= 0 ? targetIdx : nextSkills.length, 0, movingSkill);
            return { ...c, skills: nextSkills };
          }
          return c;
        })
      );
    }
    setDraggedSkill(null);
  };

  const handleSkillDropOnCategory = (targetCategoryId: string) => {
    if (!draggedSkill) return;
    const { categoryId: srcCatId, skillId: srcSkillId } = draggedSkill;
    if (srcCatId === targetCategoryId) {
      setDraggedSkill(null);
      return;
    }
    const srcCat = categories.find((c) => c.id === srcCatId);
    const movingSkill = srcCat?.skills.find((s) => s.id === srcSkillId);
    if (!movingSkill) {
      setDraggedSkill(null);
      return;
    }

    onChange(
      categories.map((c) => {
        if (c.id === srcCatId) {
          return { ...c, skills: c.skills.filter((s) => s.id !== srcSkillId) };
        }
        if (c.id === targetCategoryId) {
          return { ...c, skills: [...c.skills, movingSkill] };
        }
        return c;
      })
    );
    setDraggedSkill(null);
  };

  const handleCategoryDrop = (targetCatId: string) => {
    if (!draggedCatId || draggedCatId === targetCatId) {
      setDraggedCatId(null);
      setDropTargetCatId(null);
      return;
    }
    const srcIdx = categories.findIndex((c) => c.id === draggedCatId);
    const dstIdx = categories.findIndex((c) => c.id === targetCatId);
    if (srcIdx >= 0 && dstIdx >= 0) {
      const next = [...categories];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      onChange(next);
    }
    setDraggedCatId(null);
    setDropTargetCatId(null);
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
            draggedSkill={draggedSkill}
            onSkillDragStart={(catId, skillId) => setDraggedSkill({ categoryId: catId, skillId })}
            onSkillDropOnSkill={handleSkillDropOnSkill}
            onSkillDropOnCategory={handleSkillDropOnCategory}
            onSkillDragEnd={() => setDraggedSkill(null)}
            isCategoryDragging={draggedCatId === c.id}
            isCategoryDropTarget={dropTargetCatId === c.id && draggedCatId !== c.id}
            onCategoryDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDraggedCatId(c.id);
            }}
            onCategoryDragOver={() => {
              if (draggedCatId && dropTargetCatId !== c.id) setDropTargetCatId(c.id);
            }}
            onCategoryDrop={() => handleCategoryDrop(c.id)}
            onCategoryDragEnd={() => {
              setDraggedCatId(null);
              setDropTargetCatId(null);
            }}
            onChange={(next) => onChange(categories.map((x) => (x.id === c.id ? next : x)))}
            onDelete={() => onChange(categories.filter((x) => x.id !== c.id))}
          />
        ))}
      </div>
    </section>
  );
}
