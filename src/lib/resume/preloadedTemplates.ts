import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { ref, get, set, onValue } from "firebase/database";
import { isOnline } from "@/lib/offlineSync";
import { compileResumePdfBlobUrl, downloadResumePdf } from "./exportPdf";
import { parseLatexResume } from "./latex";
import type { MasterResume } from "./types";
import { uid } from "./utils";

export interface PreloadedResumeTemplate {
  id: string;
  name: string;
  fileName: string;
  fileType: "pdf" | "tex";
  pdfDataUrl?: string;
  texSource?: string;
  parsedResume?: MasterResume;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

const PRELOADED_TEMPLATES_KEY = (uidStr: string) => `hireme_preloaded_templates_${uidStr}`;
const memoryTemplates: Record<string, PreloadedResumeTemplate[]> = {};
const cloudTemplatesLoaded: Record<string, boolean> = {};

function writeLocalTemplatesCache(uidStr: string, serialized: string): void {
  if (typeof window === "undefined" || !uidStr) return;
  try {
    localStorage.setItem(PRELOADED_TEMPLATES_KEY(uidStr), serialized);
  } catch (e) {
    console.warn("Preloaded templates exceeded localStorage quota (Firebase RTDB remains intact):", e);
  }
}

function normalizeTemplates(parsed: unknown): PreloadedResumeTemplate[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Partial<PreloadedResumeTemplate> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const fileType = item.fileType === "tex" ? "tex" : "pdf";
      const fileName = (item.fileName || (fileType === "tex" ? "Resume.tex" : "Resume.pdf")).trim();
      const name =
        (item.name || fileName.replace(/\.(pdf|tex)$/i, "")).trim() || "Preloaded Template";
      const now = new Date().toISOString();
      return {
        id: item.id || uid("tpl"),
        name,
        fileName,
        fileType,
        pdfDataUrl: typeof item.pdfDataUrl === "string" ? item.pdfDataUrl : undefined,
        texSource: typeof item.texSource === "string" ? item.texSource : undefined,
        parsedResume: item.parsedResume as MasterResume | undefined,
        fileSizeBytes: typeof item.fileSizeBytes === "number" ? item.fileSizeBytes : 0,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || item.createdAt || now,
      };
    });
}

export function loadLocalPreloadedTemplates(uidStr: string): PreloadedResumeTemplate[] {
  if (typeof window === "undefined" || !uidStr) return [];
  if (memoryTemplates[uidStr] && memoryTemplates[uidStr].length > 0) {
    return memoryTemplates[uidStr];
  }
  try {
    const raw = localStorage.getItem(PRELOADED_TEMPLATES_KEY(uidStr));
    if (raw) {
      const parsed = normalizeTemplates(JSON.parse(raw));
      memoryTemplates[uidStr] = parsed;
      return parsed;
    }
  } catch (e) {
    console.warn("Could not read local preloaded templates:", e);
  }
  return [];
}

export function subscribePreloadedTemplates(
  uidStr: string,
  callback: (templates: PreloadedResumeTemplate[]) => void
): () => void {
  if (typeof window === "undefined" || !uidStr) return () => {};

  const local = loadLocalPreloadedTemplates(uidStr);
  if (local.length > 0) {
    callback(local);
  }

  if (isFirebaseConfigured && rtdb && uidStr) {
    try {
      const tplRef = ref(rtdb, `masterResumes/${uidStr}/preloadedTemplates`);
      const unsubscribe = onValue(
        tplRef,
        (snap) => {
          try {
            if (snap.exists()) {
              const val = snap.val();
              let items: PreloadedResumeTemplate[] = [];
              if (typeof val?.data === "string") {
                items = normalizeTemplates(JSON.parse(val.data));
              } else if (Array.isArray(val)) {
                items = normalizeTemplates(val);
              }
              memoryTemplates[uidStr] = items;
              cloudTemplatesLoaded[uidStr] = true;
              callback(items);
              writeLocalTemplatesCache(uidStr, JSON.stringify(items));
              return;
            }
            cloudTemplatesLoaded[uidStr] = true;
            const currentLocal = loadLocalPreloadedTemplates(uidStr);
            if (currentLocal.length > 0) {
              void savePreloadedTemplates(uidStr, currentLocal);
              callback(currentLocal);
            } else {
              memoryTemplates[uidStr] = [];
              callback([]);
            }
          } catch (err) {
            console.warn("Error processing RTDB preloaded templates snapshot:", err);
          }
        },
        (error) => {
          console.warn("Live RTDB preloaded templates sync warning:", error);
        }
      );
      return unsubscribe;
    } catch (e) {
      console.warn("Could not attach RTDB preloaded templates listener:", e);
    }
  }

  return () => {};
}

export async function savePreloadedTemplates(
  uidStr: string,
  templates: PreloadedResumeTemplate[]
): Promise<void> {
  if (typeof window === "undefined" || !uidStr) return;
  memoryTemplates[uidStr] = templates;
  const serialized = JSON.stringify(templates);
  const now = new Date().toISOString();

  writeLocalTemplatesCache(uidStr, serialized);

  if (isOnline() && isFirebaseConfigured && rtdb) {
    try {
      await set(ref(rtdb, `masterResumes/${uidStr}/preloadedTemplates`), {
        data: serialized,
        updatedAt: now,
      });
    } catch (e) {
      console.warn("Failed to save preloaded templates to Firebase RTDB:", e);
    }
  }
}

export function addPreloadedTemplate(
  uidStr: string,
  input: {
    name: string;
    fileName: string;
    fileType: "pdf" | "tex";
    pdfDataUrl?: string;
    texSource?: string;
    fileSizeBytes: number;
  },
  currentList?: PreloadedResumeTemplate[]
): PreloadedResumeTemplate {
  const cached = loadLocalPreloadedTemplates(uidStr);
  const existing =
    currentList && currentList.length > 0
      ? currentList
      : cached.length > 0
        ? cached
        : currentList ?? [];

  let parsedResume: MasterResume | undefined;
  if (input.fileType === "tex" && input.texSource) {
    try {
      parsedResume = parseLatexResume(input.texSource);
    } catch {
      parsedResume = undefined;
    }
  }

  const now = new Date().toISOString();
  const newTemplate: PreloadedResumeTemplate = {
    id: uid("tpl"),
    name: input.name.trim() || input.fileName.replace(/\.(pdf|tex)$/i, ""),
    fileName: input.fileName.trim(),
    fileType: input.fileType,
    pdfDataUrl: input.pdfDataUrl,
    texSource: input.texSource,
    parsedResume,
    fileSizeBytes: input.fileSizeBytes,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [newTemplate, ...existing.filter((t) => t.id !== newTemplate.id)];

  if (!cloudTemplatesLoaded[uidStr] && isOnline() && isFirebaseConfigured && rtdb && uidStr) {
    memoryTemplates[uidStr] = updated;
    get(ref(rtdb, `masterResumes/${uidStr}/preloadedTemplates`))
      .then((snap) => {
        let remoteItems: PreloadedResumeTemplate[] = [];
        if (snap.exists()) {
          const val = snap.val();
          if (typeof val?.data === "string") {
            remoteItems = normalizeTemplates(JSON.parse(val.data));
          }
        }
        const seen = new Set(updated.map((t) => t.id));
        const merged = [...updated, ...remoteItems.filter((r) => !seen.has(r.id))];
        cloudTemplatesLoaded[uidStr] = true;
        void savePreloadedTemplates(uidStr, merged);
      })
      .catch(() => {
        void savePreloadedTemplates(uidStr, updated);
      });
  } else {
    void savePreloadedTemplates(uidStr, updated);
  }

  return newTemplate;
}

export function renamePreloadedTemplate(
  uidStr: string,
  templateId: string,
  newName: string,
  currentList?: PreloadedResumeTemplate[]
): PreloadedResumeTemplate[] {
  const existing = currentList ?? loadLocalPreloadedTemplates(uidStr);
  const cleanName = newName.trim();
  if (!cleanName) return existing;
  const updated = existing.map((t) =>
    t.id === templateId ? { ...t, name: cleanName, updatedAt: new Date().toISOString() } : t
  );
  void savePreloadedTemplates(uidStr, updated);
  return updated;
}

export function deletePreloadedTemplate(
  uidStr: string,
  templateId: string,
  currentList?: PreloadedResumeTemplate[]
): PreloadedResumeTemplate[] {
  const existing = currentList ?? loadLocalPreloadedTemplates(uidStr);
  const updated = existing.filter((t) => t.id !== templateId);
  void savePreloadedTemplates(uidStr, updated);
  return updated;
}

export function dataUrlToPdfBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

export async function getPreloadedTemplatePdfBlobUrl(
  template: PreloadedResumeTemplate
): Promise<string | null> {
  if (template.fileType === "pdf" && template.pdfDataUrl) {
    const blob = dataUrlToPdfBlob(template.pdfDataUrl);
    return URL.createObjectURL(blob);
  }
  if (template.fileType === "tex") {
    if (template.parsedResume) {
      return await compileResumePdfBlobUrl(template.parsedResume);
    }
    if (template.texSource) {
      const res = await fetch("/api/resume/compile-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: template.texSource }),
      });
      if (res.ok) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
    }
  }
  return null;
}

export async function downloadPreloadedTemplatePdf(
  template: {
    fileType?: "pdf" | "tex";
    pdfDataUrl?: string;
    texSource?: string;
    parsedResume?: MasterResume;
    fileName?: string;
  },
  baseName: string
): Promise<void> {
  const finalName = baseName.endsWith(".pdf") ? baseName : `${baseName}.pdf`;
  if (template.fileType === "pdf" && template.pdfDataUrl) {
    const blob = dataUrlToPdfBlob(template.pdfDataUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (template.parsedResume) {
    await downloadResumePdf(template.parsedResume, baseName.replace(/\.pdf$/i, ""));
    return;
  }
  if (template.texSource) {
    const res = await fetch("/api/resume/compile-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: template.texSource }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
