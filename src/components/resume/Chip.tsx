"use client";

import React from "react";
import { X } from "lucide-react";

type Variant = "tool" | "metric" | "skill";

const styles: Record<Variant, string> = {
  tool: "bg-neutral-100 text-neutral-700 border-[#ebebeb]",
  skill: "bg-white text-neutral-800 border-[#ebebeb] shadow-2xs",
  metric: "bg-white text-neutral-600 border-[#ebebeb] font-mono text-[10px]",
};

export default function Chip({
  children,
  variant = "tool",
  onRemove,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variant;
  onRemove?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLSpanElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLSpanElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLSpanElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLSpanElement>) => void;
  className?: string;
}) {
  return (
    <span
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`inline-flex items-center gap-1.5 text-[11px] leading-none px-2 py-1 rounded-full border transition-all duration-150 ${
        draggable ? "cursor-grab active:cursor-grabbing select-none" : ""
      } ${styles[variant]} ${className}`}
    >
      {variant === "tool" && <span className="w-1 h-1 rounded-full bg-[#0068d6] flex-shrink-0" />}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 text-neutral-400 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
