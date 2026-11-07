"use client";

import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Contact, ContactLink, Education } from "@/lib/resume/types";
import { uid } from "@/lib/resume/utils";
import Chip from "./Chip";
import FieldEditor from "./FieldEditor";

/* --------------------------------- Contact --------------------------------- */

const inferKind = (url: string): ContactLink["kind"] =>
  /linkedin\./i.test(url) ? "linkedin" : /github\./i.test(url) ? "github" : "website";

export function ContactSection({
  contact,
  onChange,
}: {
  contact: Contact;
  onChange: (c: Contact) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingLink, setAddingLink] = useState(false);

  return (
    <section id="sec-contact" className="scroll-mt-20 space-y-3">
      <h2 className="text-sm font-semibold tracking-tight text-neutral-900 lowercase">contact</h2>

      {editing ? (
        <FieldEditor
          fields={[
            { key: "name", label: "Name", value: contact.name, required: true, wide: true },
            { key: "location", label: "Location", value: contact.location },
            { key: "phone", label: "Phone", value: contact.phone, mono: true },
            { key: "email", label: "Email", value: contact.email, mono: true, wide: true },
          ]}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            onChange({ ...contact, ...v });
            setEditing(false);
          }}
        />
      ) : (
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-bold tracking-tight text-neutral-900">{contact.name || "—"}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors active:scale-95 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {contact.location && <Chip variant="skill">{contact.location}</Chip>}
            {contact.phone && (
              <Chip variant="skill">
                <span className="font-mono">{contact.phone}</span>
              </Chip>
            )}
            {contact.email && (
              <Chip variant="skill">
                <a href={`mailto:${contact.email}`} className="font-mono hover:underline">
                  {contact.email}
                </a>
              </Chip>
            )}
            {contact.links.map((l) => (
              <Chip
                key={l.id}
                variant="skill"
                onRemove={() => onChange({ ...contact, links: contact.links.filter((x) => x.id !== l.id) })}
              >
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {l.label}
                  </a>
                ) : (
                  l.label
                )}
              </Chip>
            ))}
            <button
              type="button"
              onClick={() => setAddingLink(true)}
              className="inline-flex items-center gap-1 text-[11px] leading-none px-2 py-1 rounded-full border border-dashed border-[#d4d4d4] text-neutral-500 hover:text-neutral-900 hover:border-neutral-900 transition-colors active:scale-95 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Link</span>
            </button>
          </div>
        </div>
      )}

      {addingLink && (
        <FieldEditor
          fields={[
            { key: "label", label: "Label", value: "", required: true },
            { key: "url", label: "URL", value: "", mono: true, required: true },
          ]}
          submitLabel="Add"
          onCancel={() => setAddingLink(false)}
          onSave={(v) => {
            onChange({
              ...contact,
              links: [
                ...contact.links,
                { id: uid("l"), kind: inferKind(v.url), label: v.label, url: v.url },
              ],
            });
            setAddingLink(false);
          }}
        />
      )}
    </section>
  );
}

/* -------------------------------- Education -------------------------------- */

const eduFields = (e?: Education) => [
  { key: "institution", label: "Institution", value: e?.institution ?? "", required: true, wide: true },
  { key: "degree", label: "Degree", value: e?.degree ?? "", wide: true },
  { key: "location", label: "Location", value: e?.location ?? "" },
  { key: "dates", label: "Dates", value: e?.dates ?? "", mono: true },
];

function EducationRow({
  item,
  onChange,
  onDelete,
}: {
  item: Education;
  onChange: (e: Education) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <FieldEditor
        fields={eduFields(item)}
        onCancel={() => setEditing(false)}
        onSave={(v) => {
          onChange({ ...item, ...v });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      id={`edu-${item.id}`}
      className="scroll-mt-20 bg-white rounded-xl border border-[#ebebeb] shadow-subtle px-4 py-3.5 flex items-start justify-between gap-4"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-neutral-900">{item.institution}</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          {item.degree}
          {item.location && <span> · {item.location}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[11px] font-mono text-neutral-500 mr-1">{item.dates}</span>
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
  );
}

export function EducationSection({
  items,
  onChange,
}: {
  items: Education[];
  onChange: (items: Education[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section id="sec-education" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900 lowercase">
          education <span className="font-mono text-[11px] text-neutral-400 ml-1">{items.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>School</span>
        </button>
      </div>

      {adding && (
        <FieldEditor
          fields={eduFields()}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            onChange([
              ...items,
              {
                id: uid("e"),
                institution: v.institution,
                degree: v.degree,
                location: v.location,
                dates: v.dates,
              },
            ]);
            setAdding(false);
          }}
        />
      )}

      {items.map((item) => (
        <EducationRow
          key={item.id}
          item={item}
          onChange={(next) => onChange(items.map((x) => (x.id === item.id ? next : x)))}
          onDelete={() => onChange(items.filter((x) => x.id !== item.id))}
        />
      ))}
    </section>
  );
}
