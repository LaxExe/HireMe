import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { get, ref, set, update } from "firebase/database";
import { reconstructLatexResume } from "./latex";
import { DEFAULT_RESUME_FORMAT, type ContactLink, type MasterResume } from "./types";
import type { PreviewQueueItem } from "./previewQueue";
import type { AgentResumeEntry } from "./agentsQueue";

export const LAKSHMAN_UID = "PvKPmKmpqSZMTW9w4XVqWK3Y8El1";
export const LAKSHMAN_EMAIL = "lakshman.r.2008@gmail.com";

export const LAKSHMAN_HEADING_LATEX = [
  "%----------HEADING----------",
  "\\begin{center}",
  "    \\textbf{\\Huge Lakshman Ramanathan} \\\\ \\vspace{6pt}",
  "    \\small \\faPhone~437 263-2400 ~$\\cdot$~ \\faEnvelope~\\href{mailto:L2Ramanathan@uwaterloo.ca}{\\underline{L2Ramanathan@uwaterloo.ca}} ~$\\cdot$~ \\faLinkedin~\\href{https://linkedin.com/in/LakshmanR08}{\\underline{LakshmanR08}} ~$\\cdot$~ \\faGithub~\\href{https://github.com/LaxExe}{\\underline{LaxExe}} ~$\\cdot$~ \\faGlobe~\\href{https://lakshman-codes.github.io}{\\underline{lakshman-codes.github.io}}",
  "\\end{center}",
].join("\n");

const TARGET_CONTACT = {
  name: "Lakshman Ramanathan",
  location: "",
  phone: "437 263-2400",
  email: "L2Ramanathan@uwaterloo.ca",
} as const;

const TARGET_LINKS: Omit<ContactLink, "id">[] = [
  {
    kind: "linkedin",
    label: "LakshmanR08",
    url: "https://linkedin.com/in/LakshmanR08",
    icon: "\\faLinkedin",
  },
  {
    kind: "github",
    label: "LaxExe",
    url: "https://github.com/LaxExe",
    icon: "\\faGithub",
  },
  {
    kind: "website",
    label: "lakshman-codes.github.io",
    url: "https://lakshman-codes.github.io",
    icon: "\\faGlobe",
  },
];

export function isLakshmanAccount(uid?: string | null, email?: string | null): boolean {
  if (uid === LAKSHMAN_UID) return true;
  if (email && email.trim().toLowerCase() === LAKSHMAN_EMAIL) return true;
  return false;
}

function hasTargetContact(resume: MasterResume): boolean {
  const c = resume.contact;
  if (!c) return false;
  if (c.name !== TARGET_CONTACT.name) return false;
  if ((c.location || "") !== TARGET_CONTACT.location) return false;
  if (c.phone !== TARGET_CONTACT.phone) return false;
  if (c.email !== TARGET_CONTACT.email) return false;
  if (!Array.isArray(c.links) || c.links.length !== TARGET_LINKS.length) return false;

  return TARGET_LINKS.every((target, idx) => {
    const link = c.links[idx];
    return (
      link.kind === target.kind &&
      link.label === target.label &&
      link.url === target.url &&
      link.icon === target.icon
    );
  });
}

function hasTargetHeaderStyle(resume: MasterResume): boolean {
  const h = resume.format?.headerStyle;
  if (!h) return false;
  return (
    h.alignment === "center" &&
    h.nameSize === "Huge" &&
    h.nameBold === true &&
    h.showIcons === true &&
    h.underlineLinks === true &&
    h.separator === "cdot" &&
    !h.useResumeLinkMacro
  );
}

function normalizeNewlines(s?: string): string {
  return (s || "").replace(/\r\n/g, "\n");
}

function ensureFontAwesomeInRawLatex(rawLatex?: string): string | undefined {
  if (!rawLatex) return rawLatex;
  const docIdx = rawLatex.indexOf("\\begin{document}");
  if (docIdx < 0) return rawLatex;
  const preamble = rawLatex.slice(0, docIdx);
  if (/fontawesome/i.test(preamble)) return rawLatex;
  return `${preamble.trimEnd()}\n\\usepackage{fontawesome5}\n\n${rawLatex.slice(docIdx)}`;
}

/**
 * Replaces any existing heading/contact header in `resume` with Lakshman's exact
 * target heading block while preserving all bullets, skills, education, projects, and awards.
 */
export function applyLakshmanHeaderToResume(resume: MasterResume): {
  resume: MasterResume;
  changed: boolean;
} {
  if (!resume || typeof resume !== "object") {
    return { resume, changed: false };
  }

  const hasContent =
    (resume.education?.length || 0) +
      (resume.skills?.length || 0) +
      (resume.experience?.length || 0) +
      (resume.projects?.length || 0) +
      (resume.awards?.length || 0) >
      0 ||
    Boolean(resume.contact?.name) ||
    Boolean(resume.rawLatex);

  if (!hasContent) {
    return { resume, changed: false };
  }

  const normalizedRaw = normalizeNewlines(resume.rawLatex);
  const rawHasExactHeading = normalizedRaw.includes(LAKSHMAN_HEADING_LATEX);

  if (hasTargetContact(resume) && hasTargetHeaderStyle(resume) && rawHasExactHeading) {
    return { resume, changed: false };
  }

  const next = structuredClone(resume);
  const existingLinks = Array.isArray(next.contact?.links) ? next.contact.links : [];

  const preservedIds: Record<ContactLink["kind"], string | undefined> = {
    linkedin: existingLinks.find((l) => l.kind === "linkedin" || /linkedin\.com/i.test(l.url))?.id,
    github: existingLinks.find((l) => l.kind === "github" || /github\.com/i.test(l.url))?.id,
    website: existingLinks.find(
      (l) => l.kind === "website" || l.kind === "other" || /github\.io/i.test(l.url)
    )?.id,
    other: undefined,
  };

  next.contact = {
    name: TARGET_CONTACT.name,
    location: TARGET_CONTACT.location,
    phone: TARGET_CONTACT.phone,
    email: TARGET_CONTACT.email,
    links: TARGET_LINKS.map((t, idx) => ({
      id: preservedIds[t.kind] || `lnk_${t.kind}_${idx}`,
      kind: t.kind,
      label: t.label,
      url: t.url,
      icon: t.icon,
    })),
  };

  if (!next.format) {
    next.format = structuredClone(DEFAULT_RESUME_FORMAT);
  }
  next.format.headerStyle = {
    alignment: "center",
    nameSize: "Huge",
    nameBold: true,
    showIcons: true,
    underlineLinks: true,
    separator: "cdot",
    useResumeLinkMacro: false,
  };

  if (Array.isArray(next.sections) && !next.sections.includes("contact")) {
    next.sections = ["contact", ...next.sections];
  }

  next.rawLatex = ensureFontAwesomeInRawLatex(next.rawLatex);
  reconstructLatexResume(next);

  // If the resume used a non-subheading body layout, splice the exact heading block into rawLatex
  if (next.rawLatex && !normalizeNewlines(next.rawLatex).includes(LAKSHMAN_HEADING_LATEX)) {
    const beginCenterRe =
      /(?:%[-=]*\s*HEADING\s*[-=]*\s*\n)?\\begin\{center\}[\s\S]*?\\end\{center\}/i;
    if (beginCenterRe.test(next.rawLatex)) {
      next.rawLatex = next.rawLatex.replace(beginCenterRe, LAKSHMAN_HEADING_LATEX);
    } else {
      next.rawLatex = next.rawLatex.replace(
        "\\begin{document}",
        `\\begin{document}\n\n${LAKSHMAN_HEADING_LATEX}`
      );
    }
  }

  next.updatedAt = new Date().toISOString();
  return { resume: next, changed: true };
}

export function migrateAgentEntryFileName(fileName: string): string {
  if (!fileName) return fileName;
  return fileName.replace(/^Lakshmanan_Ramanathan(?=_|\.pdf$)/i, "Lakshman_Ramanathan");
}

const inflightMigrations = new Map<
  string,
  Promise<{ masterUpdated: boolean; previewUpdatedCount: number; agentsUpdatedCount: number }>
>();

/**
 * Migrates `masterResumes`, `previewQueues`, and `agentsQueues` in Firebase Realtime Database
 * for `lakshman.r.2008@gmail.com` so every stored application uses the new heading.
 */
export async function migrateAllLakshmanApplicationsInFirebase(
  uid: string,
  email?: string | null
): Promise<{
  masterUpdated: boolean;
  previewUpdatedCount: number;
  agentsUpdatedCount: number;
}> {
  if (!isFirebaseConfigured || !isLakshmanAccount(uid, email)) {
    return { masterUpdated: false, previewUpdatedCount: 0, agentsUpdatedCount: 0 };
  }

  const existingPromise = inflightMigrations.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const runPromise = (async () => {
    let masterUpdated = false;
    let previewUpdatedCount = 0;
    let agentsUpdatedCount = 0;

    // 1. Migrate Master Resume(s)
    try {
      const masterRef = ref(rtdb, `masterResumes/${uid}`);
      const masterSnap = await get(masterRef);
      if (masterSnap.exists()) {
        const val = masterSnap.val();
        const updates: Record<string, string> = {};

        if (typeof val?.data === "string") {
          const parsed = JSON.parse(val.data) as MasterResume;
          const { resume: migrated, changed } = applyLakshmanHeaderToResume(parsed);
          if (changed) {
            const payload = JSON.stringify(migrated);
            updates.data = payload;
            updates.updatedAt = migrated.updatedAt || new Date().toISOString();
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(`hireme_master_resume_${uid}`, payload);
              } catch {}
            }
            masterUpdated = true;
          }
        }

        if (typeof val?.resumesData === "string") {
          const parsedList = JSON.parse(val.resumesData) as MasterResume[];
          if (Array.isArray(parsedList)) {
            let listChanged = false;
            const migratedList = parsedList.map((r) => {
              const { resume: migrated, changed } = applyLakshmanHeaderToResume(r);
              if (changed) {
                listChanged = true;
                return migrated;
              }
              return r;
            });
            if (listChanged) {
              updates.resumesData = JSON.stringify(migratedList);
              updates.updatedAt = new Date().toISOString();
              masterUpdated = true;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await update(masterRef, updates);
        }
      }
    } catch (e) {
      console.warn("Firebase masterResumes header migration failed:", e);
    }

    // 2. Migrate Preview Queue Slots (use update() to preserve secretJobsStore)
    try {
      const previewRef = ref(rtdb, `previewQueues/${uid}`);
      const previewSnap = await get(previewRef);
      if (previewSnap.exists()) {
        const val = previewSnap.val();
        if (typeof val?.data === "string") {
          const items = JSON.parse(val.data) as PreviewQueueItem[];
          if (Array.isArray(items)) {
            let anyChanged = false;
            const migratedItems = items.map((item) => {
              if (!item?.baseResume) return item;
              const { resume: migratedBase, changed } = applyLakshmanHeaderToResume(
                item.baseResume
              );
              if (changed) {
                anyChanged = true;
                previewUpdatedCount += 1;
                return { ...item, baseResume: migratedBase };
              }
              return item;
            });

            if (anyChanged) {
              const payload = JSON.stringify(migratedItems);
              const updatedAt = new Date().toISOString();
              await update(previewRef, { data: payload, updatedAt });
              if (typeof window !== "undefined") {
                try {
                  localStorage.setItem(`hireme_preview_queue_${uid}`, payload);
                  localStorage.setItem("hireme_preview_queue_global", payload);
                } catch {}
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Firebase previewQueues header migration failed:", e);
    }

    // 3. Migrate Agents Queue Applications (active & archived)
    try {
      const agentsRef = ref(rtdb, `agentsQueues/${uid}`);
      const agentsSnap = await get(agentsRef);
      if (agentsSnap.exists()) {
        const val = agentsSnap.val();
        if (typeof val?.data === "string") {
          const entries = JSON.parse(val.data) as AgentResumeEntry[];
          if (Array.isArray(entries)) {
            let anyChanged = false;
            const migratedEntries = entries.map((entry) => {
              if (!entry?.tailoredResume) return entry;
              const { resume: migratedResume, changed } = applyLakshmanHeaderToResume(
                entry.tailoredResume
              );
              const nextFileName = migrateAgentEntryFileName(entry.fileName);
              const fileNameChanged = nextFileName !== entry.fileName;
              if (changed || fileNameChanged) {
                anyChanged = true;
                agentsUpdatedCount += 1;
                return {
                  ...entry,
                  tailoredResume: migratedResume,
                  fileName: nextFileName,
                };
              }
              return entry;
            });

            if (anyChanged) {
              const payload = JSON.stringify(migratedEntries);
              const updatedAt = new Date().toISOString();
              await set(agentsRef, { data: payload, updatedAt });
              if (typeof window !== "undefined") {
                try {
                  localStorage.setItem(`hireme_agents_queue_${uid}`, payload);
                  localStorage.setItem("hireme_agents_queue_global", payload);
                } catch {}
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Firebase agentsQueues header migration failed:", e);
    }

    return { masterUpdated, previewUpdatedCount, agentsUpdatedCount };
  })().finally(() => {
    inflightMigrations.delete(uid);
  });

  inflightMigrations.set(uid, runPromise);
  return runPromise;
}
