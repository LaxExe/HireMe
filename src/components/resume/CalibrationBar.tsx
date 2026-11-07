"use client";

import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, RotateCcw, Sliders } from "lucide-react";
import { useCalibration } from "@/context/CalibrationContext";
import { DEFAULT_CALIBRATION } from "@/lib/resume/types";

const SAMPLE_X_TEST =
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"; // 108 X's

const PRESETS = [
  { name: "Helvetica 11pt (0.5\" margin)", one: 108, two: 216, desc: "Matches your imported resume" },
  { name: "Helvetica 10pt", one: 116, two: 232, desc: "Slightly tighter body text" },
  { name: "Computer Modern 11pt", one: 96, two: 192, desc: "Standard LaTeX serif font" },
  { name: "Compact Margins (0.4\")", one: 122, two: 244, desc: "Wide page layout" },
];

export default function CalibrationBar() {
  const { calibration, setOneLineMax, setTwoLineMax, setCalibration, resetToDefault, isCalibrated } =
    useCalibration();
  const [open, setOpen] = useState(false);
  const [testString, setTestString] = useState("");
  const [copied, setCopied] = useState(false);

  const testCount = testString.trim().length;

  const handleCopyTest = () => {
    navigator.clipboard.writeText(`\\resumeItem{${SAMPLE_X_TEST}}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleApplyMeasured = () => {
    if (testCount > 0) {
      setOneLineMax(testCount);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden transition-all duration-200">
      {/* Top Banner Bar */}
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 text-neutral-600">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-neutral-900 tracking-tight">
              line calibration
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500">
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                1-line: {calibration.oneLineMax}
              </span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                2-line: {calibration.twoLineMax}
              </span>
            </div>
            {isCalibrated && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                custom
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 border border-[#ebebeb] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer flex-shrink-0"
        >
          <span>{open ? "Close" : "Calibrate"}</span>
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expandable Calibration Workspace */}
      {open && (
        <div className="border-t border-[#ebebeb] bg-[#fafafa] p-4 sm:p-5 space-y-5 animate-scaleIn">
          {/* Header guidance */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-neutral-900 tracking-tight">
              Calibrate to Your Exact LaTeX Layout
            </h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Resume templates wrap at different character counts depending on your margins and font.
              Test how many capital letter <span className="font-mono font-semibold text-neutral-800">X</span>&apos;s
              fill a single line in your LaTeX editor (e.g. Overleaf), then paste them here to perfectly tune the color filter.
            </p>
          </div>

          {/* Test & Measurement Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Copy test snippet & paste */}
            <div className="bg-white rounded-lg border border-[#ebebeb] p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-700 lowercase">
                  1. test in your latex template
                </span>
                <button
                  type="button"
                  onClick={handleCopyTest}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Copied snippet</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy test &apos;X&apos; bullet</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1.5">
                <textarea
                  value={testString}
                  onChange={(e) => setTestString(e.target.value)}
                  placeholder="Paste your measured string of 'X's or a full single-line bullet here..."
                  rows={2}
                  className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md p-2.5 resize-none focus:outline-none focus:border-neutral-400 placeholder:text-neutral-400"
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-mono text-neutral-500">
                    {testCount > 0 ? (
                      <span className="text-neutral-800 font-semibold">{testCount} chars counted</span>
                    ) : (
                      "0 chars"
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyMeasured}
                    disabled={testCount === 0}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 rounded-md transition-all active:scale-95 cursor-pointer shadow-subtle"
                  >
                    Set as 1-Line Max ({testCount || 108})
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Direct Character Tuning & Presets */}
            <div className="bg-white rounded-lg border border-[#ebebeb] p-3.5 space-y-3 shadow-2xs">
              <span className="text-[11px] font-semibold text-neutral-700 lowercase block">
                2. character limits
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-neutral-500 uppercase">
                    1-line max
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={40}
                      max={250}
                      value={calibration.oneLineMax}
                      onChange={(e) => setOneLineMax(Number(e.target.value))}
                      className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md px-2 py-1.5 focus:outline-none focus:border-neutral-400"
                    />
                    <span className="text-[10px] font-mono text-neutral-400">chars</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-neutral-500 uppercase">
                    2-line max
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={calibration.oneLineMax + 10}
                      max={500}
                      value={calibration.twoLineMax}
                      onChange={(e) => setTwoLineMax(Number(e.target.value))}
                      className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md px-2 py-1.5 focus:outline-none focus:border-neutral-400"
                    />
                    <span className="text-[10px] font-mono text-neutral-400">chars</span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="pt-2 border-t border-[#ebebeb] space-y-1.5">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">
                  presets
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => {
                    const active =
                      calibration.oneLineMax === p.one && calibration.twoLineMax === p.two;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setCalibration({ oneLineMax: p.one, twoLineMax: p.two })}
                        className={`text-[11px] px-2 py-0.5 rounded-md border font-mono transition-all active:scale-95 cursor-pointer ${
                          active
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-[#fafafa] text-neutral-600 border-[#ebebeb] hover:bg-neutral-100"
                        }`}
                        title={p.desc}
                      >
                        {p.one}/{p.two} ({p.name.split(" ")[0]})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Color Indicator Legend */}
          <div className="bg-white rounded-lg border border-[#ebebeb] p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-neutral-800">Green</span>
                <span className="text-neutral-500">
                  Full 1-liner (82–100%) or Full 2-liner (line 2 &gt; 65%)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="font-medium text-neutral-800">Yellow</span>
                <span className="text-neutral-500">Short line 1 or orphan line 2 (&lt; 65%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="font-medium text-neutral-800">Red</span>
                <span className="text-neutral-500">Over 2-line max (spills to 3 lines)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#ebebeb] flex-shrink-0">
              <button
                type="button"
                onClick={resetToDefault}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md shadow-subtle active:scale-95 transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
