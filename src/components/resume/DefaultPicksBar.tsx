"use client";

import React, { useMemo, useState } from "react";
import { Bookmark, Check, Pencil, X } from "lucide-react";
import {
  getRoleDefaultPicks,
  normalizeCompanyKey,
  saveGlobalRoleDefaultPick,
  type RoleDefaultPickItem,
} from "@/lib/resume/defaultMalleablePicks";
import type { MalleableSynthesizedBullet } from "@/lib/resume/larpEngine";
import type { MasterResume } from "@/lib/resume/types";
import { DEFAULT_CALIBRATION } from "@/lib/resume/types";
import { bulletFit, parseMarkup, plainText } from "@/lib/resume/utils";

export interface DefaultPicksBarProps {
  resume: MasterResume;
  uid: string;
  malleableBullets: MalleableSynthesizedBullet[];
  acceptedMalleableIds: string[];
  selectedOptionBySlotId: Record<string, string>;
  onQuickSelectDefaultPick: (pick: RoleDefaultPickItem) => void;
  onDefaultPickSaved?: (pick: RoleDefaultPickItem, newMarkup: string) => void;
}

export default function DefaultPicksBar({
  resume,
  uid,
  malleableBullets,
  acceptedMalleableIds,
  selectedOptionBySlotId,
  onQuickSelectDefaultPick,
  onDefaultPickSaved,
}: DefaultPicksBarProps) {
  const picks = useMemo(() => getRoleDefaultPicks(resume, uid), [resume, uid]);
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [draftMarkup, setDraftMarkup] = useState("");
  const [saving, setSaving] = useState(false);

  if (picks.length === 0) return null;

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const maxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const activePickBeingEdited = picks.find((p) => p.containerId === editingContainerId) || null;
  const draftPlainLen = plainText(draftMarkup).trim().length;
  const draftFit = bulletFit(draftMarkup, cal);

  const isPickActiveOnJob = (pick: RoleDefaultPickItem): boolean => {
    for (const mb of malleableBullets) {
      if (!acceptedMalleableIds.includes(mb.id)) continue;
      const matches =
        mb.targetContainerId === pick.containerId ||
        (pick.companyKey &&
          normalizeCompanyKey(mb.targetContainerTitle).includes(pick.companyKey));
      if (!matches) continue;
      const activeOptId = selectedOptionBySlotId[mb.id] || mb.options?.[0]?.id;
      const activeOpt =
        mb.options?.find((o) => o.id === activeOptId) || mb.options?.[0];
      if (
        activeOpt &&
        (activeOpt.isDefaultPick ||
          activeOpt.source === "default" ||
          activeOpt.styleLabel === "Default Pick")
      ) {
        return true;
      }
    }
    return false;
  };

  const handleStartEdit = (pick: RoleDefaultPickItem) => {
    if (editingContainerId === pick.containerId) {
      setEditingContainerId(null);
      return;
    }
    setEditingContainerId(pick.containerId);
    setDraftMarkup(pick.markup);
  };

  const handleSaveDefault = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activePickBeingEdited || !draftMarkup.trim() || saving) return;
    setSaving(true);
    try {
      const clean = draftMarkup.trim();
      await saveGlobalRoleDefaultPick(
        uid,
        activePickBeingEdited.containerId,
        activePickBeingEdited.companyName,
        clean,
        resume
      );
      onDefaultPickSaved?.(activePickBeingEdited, clean);
      setEditingContainerId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#ebebeb] bg-[#fafafa] p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-neutral-700" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-600 font-semibold">
            Default Role Picks · Shared Across All Jobs
          </span>
        </div>
        <span className="font-mono text-[10px] text-neutral-400">
          {picks.length} {picks.length === 1 ? "role" : "roles"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {picks.map((pick) => {
          const isActive = isPickActiveOnJob(pick);
          const isEditingThis = editingContainerId === pick.containerId;
          return (
            <div
              key={pick.containerId}
              className={`inline-flex items-center rounded-full border shadow-2xs transition-all duration-150 ${
                isActive
                  ? "bg-neutral-900 border-neutral-900 text-white"
                  : isEditingThis
                  ? "bg-white border-neutral-400 text-neutral-900"
                  : "bg-white border-[#ebebeb] text-neutral-700 hover:border-neutral-300"
              }`}
            >
              <button
                type="button"
                onClick={() => onQuickSelectDefaultPick(pick)}
                title={pick.markup}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 text-xs font-medium rounded-l-full active:scale-95 transition-all cursor-pointer"
              >
                {isActive && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                <span>{pick.companyName}</span>
                <span
                  className={`font-mono text-[10px] ${
                    isActive ? "text-neutral-300" : "text-neutral-400"
                  }`}
                >
                  Default
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleStartEdit(pick)}
                aria-label={`Edit default bullet for ${pick.companyName}`}
                className={`p-1.5 pr-2.5 rounded-r-full transition-colors cursor-pointer ${
                  isActive
                    ? "text-neutral-300 hover:text-white"
                    : "text-neutral-400 hover:text-neutral-900"
                }`}
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {activePickBeingEdited ? (
        <form
          onSubmit={handleSaveDefault}
          className="rounded-lg border border-[#ebebeb] bg-white p-3 space-y-2.5 animate-fadeIn"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-900">
                {activePickBeingEdited.companyName}
              </span>
              <span className="font-mono text-[10px] text-neutral-400">
                {activePickBeingEdited.roleTitle}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                  draftPlainLen > maxChars
                    ? "bg-red-50 text-red-700 border-red-200"
                    : draftFit.tone === "green"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {draftPlainLen}/{maxChars} chars · {draftFit.badge}
              </span>
              <button
                type="button"
                onClick={() => setEditingContainerId(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <textarea
            autoFocus
            rows={2}
            value={draftMarkup}
            onChange={(e) => setDraftMarkup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingContainerId(null);
            }}
            placeholder="Write a 1-line default bullet with **bold** tools..."
            className="w-full text-xs font-mono text-neutral-900 bg-[#fafafa] border border-[#ebebeb] focus:border-neutral-900 rounded-md p-2 focus:outline-none resize-none"
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-neutral-600 truncate max-w-md">
              {parseMarkup(draftMarkup).map((seg, idx) =>
                seg.bold ? (
                  <strong key={idx} className="font-semibold text-neutral-900">
                    {seg.text}
                  </strong>
                ) : (
                  <span key={idx}>{seg.text}</span>
                )
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingContainerId(null)}
                className="px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !draftMarkup.trim()}
                className="px-3 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
              >
                {saving ? "Saving..." : "Save for All Jobs"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {picks.map((pick) => (
            <div
              key={`preview-${pick.containerId}`}
              className="rounded-lg bg-white border border-[#ebebeb] px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
            >
              <div className="min-w-0 truncate text-neutral-600">
                <span className="font-mono text-[10px] font-semibold text-neutral-800 mr-1.5">
                  {pick.companyName}:
                </span>
                <span>{plainText(pick.markup)}</span>
              </div>
              <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                {pick.chars}/{pick.maxChars}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
