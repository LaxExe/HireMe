"use client";

import React, { useEffect, useRef, useState } from "react";
import { GripVertical, Pencil, Plus, Trash2, Link as LinkIcon, Bold as BoldIcon } from "lucide-react";
import type { Bullet } from "@/lib/resume/types";
import { bulletFit, makeBullet, parseMarkup, analyzeBullet } from "@/lib/resume/utils";
import { useCalibration } from "@/context/CalibrationContext";
import Chip from "./Chip";

function FitMeter({ text, detailed = false }: { text: string; detailed?: boolean }) {
  const { calibration } = useCalibration();
  const fit = bulletFit(text, calibration);

  const badgeStyles = {
    neutral: "bg-neutral-100 text-neutral-500 border-neutral-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };

  const line1BarColor =
    fit.tone === "red"
      ? "bg-red-500"
      : fit.targetLines === 1
      ? fit.tone === "green"
        ? "bg-emerald-500"
        : "bg-amber-400"
      : "bg-neutral-400";

  const line2BarColor =
    fit.tone === "red"
      ? "bg-red-500"
      : fit.tone === "green"
      ? "bg-emerald-500"
      : "bg-amber-400";

  return (
    <div className="flex items-center gap-2 flex-shrink-0" title={fit.tooltip}>
      {/* Target Line Badge */}
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${badgeStyles[fit.tone]}`}
      >
        {fit.badge}
      </span>

      {/* Two-stage Line Meter */}
      <div className="flex items-center gap-1 w-14 sm:w-16" title={fit.tooltip}>
        {/* Line 1 segment */}
        <div className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-150 ${line1BarColor}`}
            style={{ width: `${Math.min(100, fit.line1Progress * 100)}%` }}
          />
        </div>
        {/* Line 2 segment */}
        <div className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-150 ${line2BarColor}`}
            style={{ width: `${Math.min(100, fit.line2Progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Monospace Character Count */}
      <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
        {fit.length}
        {detailed && (
          <span className="text-neutral-400">
            /{fit.targetLines === 1 ? calibration.oneLineMax : calibration.twoLineMax}
          </span>
        )}
      </span>

      {detailed && (
        <span
          className={`text-[11px] font-medium hidden sm:inline ${
            fit.tone === "green"
              ? "text-emerald-600"
              : fit.tone === "amber"
              ? "text-amber-600"
              : fit.tone === "red"
              ? "text-red-600"
              : "text-neutral-500"
          }`}
        >
          {fit.label}
        </span>
      )}
    </div>
  );
}

interface BulletSegment {
  type: "text" | "link";
  text?: string;
  label?: string;
  url?: string;
  bold: boolean;
}

function parseBulletSegments(markup: string): BulletSegment[] {
  const links: { label: string; url: string }[] = [];
  const withLinkTokens = markup.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|[^\s)]+)\)/g,
    (_, label, url) => {
      const idx = links.length;
      links.push({ label, url });
      return `\u0000LINK_${idx}\u0000`;
    }
  );

  const segments: BulletSegment[] = [];
  const parts = withLinkTokens.split("**");
  parts.forEach((part, i) => {
    const bold = i % 2 === 1;
    const tokens = part.split(/(\u0000LINK_\d+\u0000)/g);
    for (const t of tokens) {
      const match = t.match(/\u0000LINK_(\d+)\u0000/);
      if (match) {
        const link = links[Number(match[1])];
        const isBold = bold || /\*\*[^*]+\*\*/.test(link.label);
        const cleanLabel = link.label.replace(/\*\*/g, "");
        segments.push({
          type: "link",
          label: cleanLabel,
          url: link.url,
          bold: isBold,
        });
      } else if (t) {
        segments.push({
          type: "text",
          text: t,
          bold,
        });
      }
    }
  });

  return segments;
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
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [selectionRange, setSelectionRange] = useState<[number, number]>([0, 0]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const openLinkModal = () => {
    const el = ref.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setSelectionRange([start, end]);
      const selected = text.slice(start, end).trim();
      setLinkLabel(selected || "");
    } else {
      setSelectionRange([text.length, text.length]);
      setLinkLabel("");
    }
    setLinkUrl("https://");
    setShowLinkModal(true);
    setTimeout(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }, 50);
  };

  const applyLink = () => {
    const label = linkLabel.trim() || "link";
    const rawUrl = linkUrl.trim();
    if (!rawUrl) {
      setShowLinkModal(false);
      return;
    }
    const cleanUrl =
      rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("mailto:")
        ? rawUrl
        : `https://${rawUrl}`;
    const md = `[${label}](${cleanUrl})`;

    const [start, end] = selectionRange;
    const next = text.slice(0, start) + md + text.slice(end);
    setText(next);
    setShowLinkModal(false);
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        const cursor = start + md.length;
        ref.current.setSelectionRange(cursor, cursor);
      }
    }, 50);
  };

  const toggleBold = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end);
    if (selected) {
      if (selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4) {
        const unbolded = selected.slice(2, -2);
        const next = text.slice(0, start) + unbolded + text.slice(end);
        setText(next);
      } else {
        const bolded = `**${selected}**`;
        const next = text.slice(0, start) + bolded + text.slice(end);
        setText(next);
      }
    } else {
      const next = text.slice(0, start) + "**bold**" + text.slice(end);
      setText(next);
    }
  };

  const submit = () => {
    const t = text.trim();
    if (t) onSubmit(t);
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-900 p-3 space-y-2.5 animate-scaleIn">
      {/* Mini toolbar for markdown formatting */}
      <div className="flex items-center gap-1 pb-1 border-b border-[#ebebeb]">
        <button
          type="button"
          onClick={toggleBold}
          title="Bold (Cmd+B)"
          className="p-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors active:scale-95 cursor-pointer text-xs font-bold px-1.5"
        >
          <BoldIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={openLinkModal}
          title="Add Link (Cmd+K)"
          className="inline-flex items-center gap-1 p-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors active:scale-95 cursor-pointer text-xs px-1.5"
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">Link</span>
        </button>
      </div>

      {showLinkModal && (
        <div className="p-2.5 bg-neutral-50 rounded-md border border-[#ebebeb] space-y-2 animate-scaleIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">Link Text</label>
              <input
                type="text"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Words to link"
                className="w-full px-2 py-1 text-xs bg-white border border-[#ebebeb] rounded focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-600 mb-0.5">URL</label>
              <input
                ref={urlInputRef}
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  } else if (e.key === "Escape") {
                    setShowLinkModal(false);
                  }
                }}
                placeholder="https://..."
                className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#ebebeb] rounded focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowLinkModal(false)}
              className="px-2 py-0.5 text-[11px] text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyLink}
              className="px-2.5 py-0.5 text-[11px] font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              Insert Link
            </button>
          </div>
        </div>
      )}

      <textarea
        ref={ref}
        value={text}
        autoFocus
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (showLinkModal) setShowLinkModal(false);
            else onCancel();
          }
          if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            openLinkModal();
          }
          if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            toggleBold();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="w-full resize-none text-xs leading-relaxed text-neutral-900 bg-transparent focus:outline-none"
      />
      <div className="flex items-center justify-between pt-2 border-t border-[#ebebeb] gap-3 flex-wrap">
        <FitMeter text={text} detailed />
        <div className="flex items-center gap-2 flex-shrink-0">
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
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onChange,
  onDelete,
}: {
  bullet: Bullet;
  known: string[];
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
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
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg border transition-all duration-150 shadow-2xs p-3 flex items-start gap-2 ${
        isDragging
          ? "opacity-40 border-dashed border-neutral-400"
          : isDropTarget
          ? "border-neutral-900 ring-1 ring-neutral-900/10"
          : "border-[#ebebeb]"
      }`}
    >
      <span
        className="mt-0.5 text-neutral-300 hover:text-neutral-600 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
        title="Drag to reorder point"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </span>

      <div className="flex-1 min-w-0 space-y-2.5">
        <p className="text-xs leading-relaxed text-neutral-700 font-sans">
          {parseBulletSegments(bullet.text).map((seg, i) => {
            if (seg.type === "link") {
              const href =
                seg.url?.startsWith("http") || seg.url?.startsWith("mailto:")
                  ? seg.url
                  : `https://${seg.url}`;
              return (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline underline-offset-2 decoration-neutral-300 hover:decoration-neutral-900 transition-colors ${
                    seg.bold ? "font-semibold text-neutral-900" : "text-neutral-700"
                  }`}
                  style={{ fontFamily: "inherit", fontSize: "inherit" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {seg.label}
                </a>
              );
            }
            return seg.bold ? (
              <strong key={i} className="font-semibold text-neutral-900" style={{ fontFamily: "inherit", fontSize: "inherit" }}>
                {seg.text}
              </strong>
            ) : (
              <span key={i} style={{ fontFamily: "inherit", fontSize: "inherit" }}>{seg.text}</span>
            );
          })}
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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const srcIdx = bullets.findIndex((b) => b.id === draggedId);
    const dstIdx = bullets.findIndex((b) => b.id === targetId);
    if (srcIdx >= 0 && dstIdx >= 0) {
      const next = [...bullets];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      onChange(next);
    }
    setDraggedId(null);
    setDropTargetId(null);
  };

  return (
    <div className="space-y-2">
      {bullets.map((b) => (
        <BulletCard
          key={b.id}
          bullet={b}
          known={known}
          isDragging={draggedId === b.id}
          isDropTarget={dropTargetId === b.id && draggedId !== b.id}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            setDraggedId(b.id);
          }}
          onDragOver={(e) => {
            if (!draggedId) return;
            e.preventDefault();
            e.stopPropagation();
            if (dropTargetId !== b.id) setDropTargetId(b.id);
          }}
          onDrop={(e) => {
            if (!draggedId) return;
            e.preventDefault();
            e.stopPropagation();
            handleDrop(b.id);
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTargetId(null);
          }}
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
