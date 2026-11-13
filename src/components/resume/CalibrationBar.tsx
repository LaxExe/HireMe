"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Sliders } from "lucide-react";
import { useCalibration } from "@/context/CalibrationContext";
import { plainText } from "@/lib/resume/utils";

export default function CalibrationBar() {
  const {
    calibration,
    setOneLineMax,
    setTwoLineMax,
    setMalleableLines,
    resetToDefault,
    isCalibrated,
  } = useCalibration();
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState("");
  const [oneDraft, setOneDraft] = useState(String(calibration.oneLineMax));
  const [twoDraft, setTwoDraft] = useState(String(calibration.twoLineMax));
  const [malleableDraft, setMalleableDraft] = useState(
    String(calibration.malleableLines ?? 1)
  );

  useEffect(() => {
    setOneDraft(String(calibration.oneLineMax));
  }, [calibration.oneLineMax]);

  useEffect(() => {
    setTwoDraft(String(calibration.twoLineMax));
  }, [calibration.twoLineMax]);

  useEffect(() => {
    setMalleableDraft(String(calibration.malleableLines ?? 1));
  }, [calibration.malleableLines]);

  const charCount = plainText(sample).trim().length;

  const handleOneChange = (val: string) => {
    setOneDraft(val);
    const parsed = Number(val);
    if (val.trim() !== "" && Number.isFinite(parsed) && parsed >= 1) {
      setOneLineMax(parsed);
    }
  };

  const handleTwoChange = (val: string) => {
    setTwoDraft(val);
    const parsed = Number(val);
    if (val.trim() !== "" && Number.isFinite(parsed) && parsed > calibration.oneLineMax) {
      setTwoLineMax(parsed);
    }
  };

  const handleMalleableChange = (val: string) => {
    setMalleableDraft(val);
    const parsed = Number(val);
    if (val.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
      setMalleableLines(parsed);
    }
  };

  const commitDrafts = () => {
    const p1 = Number(oneDraft);
    if (!Number.isFinite(p1) || p1 < 1) {
      setOneDraft(String(calibration.oneLineMax));
    } else {
      setOneLineMax(p1);
    }
    const p2 = Number(twoDraft);
    if (!Number.isFinite(p2) || p2 <= calibration.oneLineMax) {
      setTwoDraft(String(calibration.twoLineMax));
    } else {
      setTwoLineMax(p2);
    }
    const pm = Number(malleableDraft);
    if (!Number.isFinite(pm) || pm < 0) {
      setMalleableDraft(String(calibration.malleableLines ?? 1));
    } else {
      setMalleableLines(pm);
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
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                1-line: {calibration.oneLineMax}
              </span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                2-line: {calibration.twoLineMax}
              </span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                malleable lines: {calibration.malleableLines ?? 1}
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

      {/* Simplified Calibration Panel */}
      {open && (
        <div className="border-t border-[#ebebeb] bg-[#fafafa] p-4 space-y-4 animate-scaleIn">
          {/* Direct Character Max Inputs + Malleable Lines */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-[#ebebeb] p-3 shadow-2xs space-y-1.5">
              <label
                htmlFor="cal-one-line"
                className="text-[11px] font-mono text-neutral-500 uppercase block"
              >
                1-line max
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="cal-one-line"
                  type="number"
                  min={1}
                  max={500}
                  value={oneDraft}
                  onChange={(e) => handleOneChange(e.target.value)}
                  onBlur={commitDrafts}
                  className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-neutral-400"
                />
                <span className="text-[11px] font-mono text-neutral-400 flex-shrink-0">
                  chars
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[#ebebeb] p-3 shadow-2xs space-y-1.5">
              <label
                htmlFor="cal-two-line"
                className="text-[11px] font-mono text-neutral-500 uppercase block"
              >
                2-line max
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="cal-two-line"
                  type="number"
                  min={calibration.oneLineMax + 1}
                  max={1000}
                  value={twoDraft}
                  onChange={(e) => handleTwoChange(e.target.value)}
                  onBlur={commitDrafts}
                  className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-neutral-400"
                />
                <span className="text-[11px] font-mono text-neutral-400 flex-shrink-0">
                  chars
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[#ebebeb] p-3 shadow-2xs space-y-1.5">
              <label
                htmlFor="cal-malleable-lines"
                className="text-[11px] font-mono text-neutral-500 uppercase block"
              >
                malleable lines (1L larp bullets)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="cal-malleable-lines"
                  type="number"
                  min={0}
                  max={6}
                  value={malleableDraft}
                  onChange={(e) => handleMalleableChange(e.target.value)}
                  onBlur={commitDrafts}
                  className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-neutral-400"
                />
                <span className="text-[11px] font-mono text-neutral-400 flex-shrink-0">
                  lines
                </span>
              </div>
            </div>
          </div>

          {/* Paste to Count */}
          <div className="bg-white rounded-lg border border-[#ebebeb] p-3 shadow-2xs space-y-2.5">
            <textarea
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Paste a 1-line or 2-line bullet here to count characters..."
              rows={2}
              className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] rounded-md p-2.5 resize-none focus:outline-none focus:border-neutral-400 placeholder:text-neutral-400"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-mono text-neutral-600 tabular-nums">
                {charCount} chars
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => charCount >= 1 && setOneLineMax(charCount)}
                  disabled={charCount < 1}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 rounded-md transition-all active:scale-95 cursor-pointer"
                >
                  Set 1-Line Max
                </button>
                <button
                  type="button"
                  onClick={() => charCount > calibration.oneLineMax && setTwoLineMax(charCount)}
                  disabled={charCount <= calibration.oneLineMax}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded-md shadow-subtle transition-all active:scale-95 cursor-pointer"
                >
                  Set 2-Line Max
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2">
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
      )}
    </div>
  );
}
