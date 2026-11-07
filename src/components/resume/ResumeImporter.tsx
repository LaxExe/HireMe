"use client";

import React, { useRef, useState } from "react";
import { parseLatexResume, isEmptyResume } from "@/lib/resume/latex";
import type { MasterResume } from "@/lib/resume/types";

export default function ResumeImporter({
  onParsed,
  onCancel,
}: {
  onParsed: (resume: MasterResume) => void;
  onCancel?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSource = (source: string) => {
    setError(null);
    try {
      const parsed = parseLatexResume(source);
      if (isEmptyResume(parsed)) {
        setError("No resume content found.");
        return;
      }
      onParsed(parsed);
    } catch (e) {
      console.error(e);
      setError("Could not parse this file.");
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    handleSource(await file.text());
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 animate-scaleIn">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border border-dashed bg-white p-6 transition-colors ${
          dragging ? "border-neutral-900 bg-neutral-50" : "border-[#d4d4d4]"
        }`}
      >
        {pasting ? (
          <div className="space-y-3">
            <textarea
              value={pasted}
              autoFocus
              onChange={(e) => setPasted(e.target.value)}
              placeholder="\documentclass{article} ..."
              className="w-full h-56 p-3 text-[11px] font-mono leading-relaxed bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasting(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!pasted.trim()}
                onClick={() => handleSource(pasted)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full disabled:opacity-40 shadow-subtle active:scale-95 transition-all cursor-pointer"
              >
                Parse
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-5 py-2.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-subtle hover:shadow-subtle-hover active:scale-95 transition-all duration-150 cursor-pointer"
            >
              Upload .tex
            </button>
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
            >
              Paste LaTeX
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".tex,.txt,text/plain,application/x-tex"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-2.5 rounded-md bg-red-50 border border-red-200/50 text-[11px] text-red-600 font-medium">
          {error}
        </div>
      )}

      {onCancel && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
