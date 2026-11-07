"use client";

import React, { useState } from "react";

export interface Field {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
  required?: boolean;
}

export default function FieldEditor({
  fields,
  onSave,
  onCancel,
  submitLabel = "Save",
}: {
  fields: Field[];
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.value]))
  );

  const valid = fields.every((f) => !f.required || values[f.key]?.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
      }}
      className="bg-white p-4 rounded-xl border border-[#ebebeb] shadow-subtle space-y-3 animate-scaleIn"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f, i) => (
          <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <label className="block text-xs font-medium text-neutral-700 mb-1">{f.label}</label>
            <input
              type="text"
              value={values[f.key]}
              autoFocus={i === 0}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              className={`w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs ${
                f.mono ? "font-mono" : ""
              }`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-[#ebebeb]">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid}
          className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md transition-colors disabled:opacity-40 shadow-subtle active:scale-95 cursor-pointer"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
