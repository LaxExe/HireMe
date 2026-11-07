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
}: {
  children: React.ReactNode;
  variant?: Variant;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] leading-none px-2 py-1 rounded-full border ${styles[variant]}`}
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
