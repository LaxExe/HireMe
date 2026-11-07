"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Bullet } from "@/lib/resume/types";
import { bulletFit, makeBullet, parseMarkup, analyzeBullet, FitStatus } from "@/lib/resume/utils";
import Chip from "./Chip";

const barColor: Record<FitStatus, string> = {
  empty: "bg-neutral-200",
  ideal: "bg-emerald-500",
  short: "bg-amber-400",
  orphan: "bg-amber-400",
  long: "bg-red-500",
};

function FitMeter({ text }: { text: string }) {
  const fit = bulletFit(text);
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="w-12 h-1 rounded-full bg-neutral-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-150 ${barColor[fit.status]}`}
          style={{ width: `${fit.ratio * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-neutral-500 tabular-nums w-7 text-right">
        {fit.length}
      </span>
    </div>
  );
}

function BulletEditor({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (t) onSubmit(t);
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-900 p-3 space-y-2 animate-scaleIn">
      <textarea
        ref={ref}
        value={text}
        autoFocus
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="w-full resize-none text-xs leading-relaxed text-neutral-900 bg-transparent focus:outline-none"
      />
      <div className="flex items-center justify-between pt-2 border-t border-[#ebebeb]">
        <FitMeter text={text} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="px-3 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulletCard({
  bullet,
  known,
  onChange,
  onDelete,
}: {
  bullet: Bullet;
  known: string[];
  onChange: (b: Bullet) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <BulletEditor
        initial={bullet.text}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSubmit={(text) => {
          onChange({ ...bullet, text, ...analyzeBullet(text, known) });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#ebebeb] shadow-2xs p-3 space-y-2.5">
      <p className="text-xs leading-relaxed text-neutral-700">
        {parseMarkup(bullet.text).map((seg, i) =>
          seg.bold ? (
            <strong key={i} className="font-semibold text-neutral-900">
              {seg.text}
            </strong>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {bullet.tools.map((t) => (
            <Chip key={`t-${t}`}>{t}</Chip>
          ))}
          {bullet.metrics.map((m) => (
            <Chip key={`m-${m}`} variant="metric">
              {m}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <FitMeter text={bullet.text} />
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
    </div>
  );
}

export default function BulletList({
  bullets,
  known,
  onChange,
}: {
  bullets: Bullet[];
  known: string[];
  onChange: (bullets: Bullet[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      {bullets.map((b) => (
        <BulletCard
          key={b.id}
          bullet={b}
          known={known}
          onChange={(next) => onChange(bullets.map((x) => (x.id === b.id ? next : x)))}
          onDelete={() => onChange(bullets.filter((x) => x.id !== b.id))}
        />
      ))}
      {adding ? (
        <BulletEditor
          initial=""
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSubmit={(text) => {
            onChange([...bullets, makeBullet(text, known)]);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-md transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Bullet</span>
        </button>
      )}
    </div>
  );
}
