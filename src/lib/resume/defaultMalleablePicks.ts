import { rtdb, isFirebaseConfigured } from "@/lib/firebase";
import { get, ref, update } from "firebase/database";
import { isOnline } from "@/lib/offlineSync";
import { markupToLatex } from "./latex";
import { loadMasterResume, saveMasterResume } from "./store";
import { bulletFit, plainText, type BulletFitResult } from "./utils";
import { DEFAULT_CALIBRATION, inferDomainTags } from "./larp/config";
import { calculateDynamicBelievabilityScore } from "./larp/scoring";
import { computeVisualWidth, fitBulletToCalibratedLineArea } from "./larp/text";
import type { MalleableBulletOption, MalleableSynthesizedBullet } from "./larp/types";
import type { CalibrationConfig, Job, MasterResume } from "./types";
import type { PreviewQueueItem } from "./previewQueue";

export interface RoleDefaultPickItem {
  containerId: string;
  companyName: string;
  companyKey: string;
  roleTitle: string;
  markup: string;
  chars: number;
  maxChars: number;
  fit: BulletFitResult;
}

const DEFAULT_PICKS_KEY = (uid: string) => `hireme_default_malleable_picks_${uid}`;
const memoryDefaultPicksByUid: Record<string, Record<string, string>> = {};

export function normalizeCompanyKey(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function inferDefaultPickForRole(
  job: Job,
  cal: CalibrationConfig = DEFAULT_CALIBRATION
): string {
  const combinedText = `${job.title} ${job.company} ${job.bullets
    .map((b) => plainText(b.text))
    .join(" ")}`;
  const tools = job.bullets.flatMap((b) => b.tools);
  const tags =
    job.tags && job.tags.length > 0 ? job.tags : inferDomainTags(combinedText, tools);
  const lower = combinedText.toLowerCase();

  let draft =
    "Built automated integration tests and structured error handling across core production services.";

  if (tags.includes("systems")) {
    draft =
      "Authored modular **C++** simulation regression tests to verify node stability across builds.";
  } else if (tags.includes("ml") && !tags.includes("frontend")) {
    draft =
      "Automated **Python** evaluation scripts and validation checks across benchmark pipeline runs.";
  } else if (tags.includes("backend") && /\bfastapi\b/i.test(lower)) {
    draft =
      "Added **FastAPI** integration tests and structured error handling across backend endpoints.";
  } else if (tags.includes("frontend") || /\b(?:typescript|react|next\.js)\b/i.test(lower)) {
    draft =
      "Built **TypeScript** integration tests and request validation guards across core API routes.";
  }

  return fitBulletToCalibratedLineArea(draft, cal);
}

export function loadLocalDefaultPicksMap(uid?: string | null): Record<string, string> {
  if (!uid) return {};
  if (typeof window === "undefined") {
    return memoryDefaultPicksByUid[uid] ? { ...memoryDefaultPicksByUid[uid] } : {};
  }
  try {
    const raw = localStorage.getItem(DEFAULT_PICKS_KEY(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        memoryDefaultPicksByUid[uid] = parsed;
        return { ...parsed };
      }
    }
  } catch {}
  return memoryDefaultPicksByUid[uid] ? { ...memoryDefaultPicksByUid[uid] } : {};
}

export function saveLocalDefaultPicksMap(
  uid: string,
  map: Record<string, string>
): void {
  if (!uid) return;
  memoryDefaultPicksByUid[uid] = { ...map };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(DEFAULT_PICKS_KEY(uid), JSON.stringify(map));
    } catch {}
  }
}

export function buildCompanyDefaultPicksMap(
  resume?: MasterResume | null,
  uid?: string | null
): Record<string, string> {
  const merged: Record<string, string> = {};
  const localMap = loadLocalDefaultPicksMap(uid);

  if (resume?.defaultMalleableByContainer) {
    for (const [k, v] of Object.entries(resume.defaultMalleableByContainer)) {
      if (typeof v === "string" && v.trim()) {
        merged[k] = v.trim();
      }
    }
  }

  if (resume?.experience) {
    for (const job of resume.experience) {
      const key = normalizeCompanyKey(job.company);
      if (job.defaultMalleableBullet?.trim()) {
        if (key) merged[key] = job.defaultMalleableBullet.trim();
        merged[job.id] = job.defaultMalleableBullet.trim();
      }
    }
  }

  // Local map overrides stale slot caches on the same browser when edited across tabs
  for (const [k, v] of Object.entries(localMap)) {
    if (typeof v === "string" && v.trim()) {
      merged[k] = v.trim();
    }
  }

  return merged;
}

export function getRoleDefaultPicks(
  resume: MasterResume,
  uid?: string | null
): RoleDefaultPickItem[] {
  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const maxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const mergedMap = buildCompanyDefaultPicksMap(resume, uid);

  return resume.experience.map((job) => {
    const companyName = job.company || job.title || "Role";
    const companyKey = normalizeCompanyKey(companyName) || job.id;
    const rawMarkup =
      mergedMap[companyKey] ||
      mergedMap[job.id] ||
      job.defaultMalleableBullet?.trim() ||
      inferDefaultPickForRole(job, cal);

    const fitted = fitBulletToCalibratedLineArea(rawMarkup, cal);
    const chars = plainText(fitted).trim().length;
    return {
      containerId: job.id,
      companyName,
      companyKey,
      roleTitle: job.title,
      markup: fitted,
      chars,
      maxChars,
      fit: bulletFit(fitted, cal),
    };
  });
}

export function applyDefaultPickToMasterResume(
  resume: MasterResume,
  containerId: string,
  companyName: string,
  markup: string
): MasterResume {
  const cleanMarkup = markup.trim();
  const targetKey = normalizeCompanyKey(companyName);
  const next = structuredClone(resume);

  next.experience = next.experience.map((job) => {
    const jobKey = normalizeCompanyKey(job.company);
    if (job.id === containerId || (targetKey && jobKey === targetKey)) {
      return {
        ...job,
        defaultMalleableBullet: cleanMarkup,
      };
    }
    return job;
  });

  const nextMap: Record<string, string> = {
    ...(next.defaultMalleableByContainer || {}),
  };
  if (targetKey) nextMap[targetKey] = cleanMarkup;
  if (containerId) nextMap[containerId] = cleanMarkup;
  next.defaultMalleableByContainer = nextMap;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function applyDefaultPickToPreviewItem(
  item: PreviewQueueItem,
  containerId: string,
  companyName: string,
  markup: string
): PreviewQueueItem {
  const cleanMarkup = markup.trim();
  const targetKey = normalizeCompanyKey(companyName);
  const cal = item.baseResume?.calibration ?? DEFAULT_CALIBRATION;
  const oneLineMax = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const nextBaseResume = applyDefaultPickToMasterResume(
    item.baseResume,
    containerId,
    companyName,
    cleanMarkup
  );

  const latex = `\\item ${markupToLatex(cleanMarkup)}`;
  const chars = plainText(cleanMarkup).trim().length;
  const widthNcu = computeVisualWidth(latex);
  const fit = bulletFit(cleanMarkup, cal);

  const nextMalleableBullets = (item.larpRun?.malleableBullets || []).map((mb) => {
    const matchesContainer =
      mb.targetContainerId === containerId ||
      (targetKey && normalizeCompanyKey(mb.targetContainerTitle).includes(targetKey));
    if (!matchesContainer) return mb;

    let foundDefault = false;
    const nextOptions = (mb.options || []).map((opt) => {
      if (opt.isDefaultPick || opt.source === "default" || opt.styleLabel === "Default Pick") {
        foundDefault = true;
        return {
          ...opt,
          markup: cleanMarkup,
          latex,
          chars,
          maxChars: oneLineMax,
          widthNcu,
          fit,
        };
      }
      return opt;
    });

    if (!foundDefault) {
      nextOptions.push({
        id: `${mb.id}-default`,
        styleLabel: "Default Pick",
        markup: cleanMarkup,
        latex,
        chars,
        maxChars: oneLineMax,
        widthNcu,
        fit,
        easyExplanation: `Saved Default Pick for ${companyName || mb.targetContainerTitle}.`,
        isNewClaim: true,
        isDefaultPick: true,
        source: "default",
      });
    }

    const selectedOptId = item.selectedMalleableOptionBySlotId?.[mb.id];
    const activeDefaultOpt = nextOptions.find(
      (o) =>
        o.id === selectedOptId &&
        (o.isDefaultPick || o.source === "default" || o.styleLabel === "Default Pick")
    );

    return {
      ...mb,
      options: nextOptions,
      ...(activeDefaultOpt
        ? {
            markup: cleanMarkup,
            latex,
            chars,
            widthNcu,
            fit,
          }
        : {}),
    };
  });

  return {
    ...item,
    baseResume: nextBaseResume,
    larpRun: {
      ...item.larpRun,
      malleableBullets: nextMalleableBullets,
    },
  };
}

/**
 * Saves a global per-company/per-role Default Pick 1-line bullet across `localStorage`,
 * `masterResumes/${uid}`, and every queued job application in `previewQueues/${uid}`.
 */
export async function saveGlobalRoleDefaultPick(
  uid: string,
  containerId: string,
  companyName: string,
  markup: string,
  masterResume?: MasterResume | null
): Promise<void> {
  if (!uid) return;
  const cleanMarkup = markup.trim();
  const targetKey = normalizeCompanyKey(companyName);

  // 1. Persist in local picks map
  const localMap = loadLocalDefaultPicksMap(uid);
  if (targetKey) localMap[targetKey] = cleanMarkup;
  if (containerId) localMap[containerId] = cleanMarkup;
  saveLocalDefaultPicksMap(uid, localMap);

  // 2. Persist into MasterResume (localStorage + RTDB masterResumes/${uid})
  try {
    const resolvedMaster = masterResume ?? (await loadMasterResume(uid));
    if (resolvedMaster) {
      const updatedMaster = applyDefaultPickToMasterResume(
        resolvedMaster,
        containerId,
        companyName,
        cleanMarkup
      );
      await saveMasterResume(uid, updatedMaster);
    }
  } catch (e) {
    console.warn("Could not persist default pick into MasterResume:", e);
  }

  // 3. Propagate across all queued job applications in previewQueues/${uid}
  if (typeof window !== "undefined") {
    try {
      const key = `hireme_preview_queue_${uid}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PreviewQueueItem[];
        if (Array.isArray(parsed)) {
          const updatedLocal = parsed.map((item) =>
            applyDefaultPickToPreviewItem(item, containerId, companyName, cleanMarkup)
          );
          const serialized = JSON.stringify(updatedLocal);
          localStorage.setItem(key, serialized);
          localStorage.setItem("hireme_preview_queue_global", serialized);
        }
      }
    } catch {}
  }

  if (isOnline() && isFirebaseConfigured) {
    try {
      const qRef = ref(rtdb, `previewQueues/${uid}`);
      const snap = await get(qRef);
      if (snap.exists()) {
        const val = snap.val();
        if (typeof val?.data === "string") {
          const parsed = JSON.parse(val.data) as PreviewQueueItem[];
          if (Array.isArray(parsed)) {
            const updatedRemote = parsed.map((item) =>
              applyDefaultPickToPreviewItem(item, containerId, companyName, cleanMarkup)
            );
            const serialized = JSON.stringify(updatedRemote);
            const now = new Date().toISOString();
            await update(qRef, { data: serialized, updatedAt: now });
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(`hireme_preview_queue_${uid}`, serialized);
                localStorage.setItem("hireme_preview_queue_global", serialized);
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not propagate default pick across Firebase previewQueues:", e);
    }
  }
}

/**
 * Shared state helper for quick-selecting (or toggling off) a company's Default Pick
 * across `/preview` and `/operations`. Adds a card on the fly if the company wasn't in the
 * top 1-2 JD-matched slots.
 */
export function toggleOrSelectDefaultPickInState(params: {
  pick: RoleDefaultPickItem;
  resume: MasterResume;
  malleableBullets: MalleableSynthesizedBullet[];
  acceptedMalleableIds: string[];
  selectedOptionBySlotId: Record<string, string>;
}): {
  nextMalleableBullets: MalleableSynthesizedBullet[];
  nextAcceptedMalleableIds: string[];
  nextSelectedOptionMap: Record<string, string>;
} {
  const {
    pick,
    resume,
    malleableBullets,
    acceptedMalleableIds,
    selectedOptionBySlotId,
  } = params;

  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const maxChars = cal.oneLineMax || DEFAULT_CALIBRATION.oneLineMax;
  const existingIdx = malleableBullets.findIndex(
    (mb) =>
      mb.targetContainerId === pick.containerId ||
      (pick.companyKey &&
        normalizeCompanyKey(mb.targetContainerTitle).includes(pick.companyKey))
  );

  const latex = `\\item ${markupToLatex(pick.markup)}`;
  const chars = plainText(pick.markup).trim().length;
  const widthNcu = computeVisualWidth(latex);
  const fit = bulletFit(pick.markup, cal);

  if (existingIdx >= 0) {
    const targetMb = malleableBullets[existingIdx];
    const nextMbList = [...malleableBullets];
    let defaultOpt = targetMb.options.find(
      (o) => o.isDefaultPick || o.source === "default" || o.styleLabel === "Default Pick"
    );

    if (!defaultOpt) {
      defaultOpt = {
        id: `${targetMb.id}-default`,
        styleLabel: "Default Pick",
        markup: pick.markup,
        latex,
        chars,
        maxChars,
        widthNcu,
        fit,
        easyExplanation: `Saved Default Pick for ${pick.companyName} (shared across all job applications).`,
        isNewClaim: true,
        isDefaultPick: true,
        source: "default",
      };
      nextMbList[existingIdx] = {
        ...targetMb,
        options: [...targetMb.options, defaultOpt],
      };
    }

    const isCurrentlySelected = acceptedMalleableIds.includes(targetMb.id);
    const currentOptId = selectedOptionBySlotId[targetMb.id] || targetMb.options[0]?.id;

    if (isCurrentlySelected && currentOptId === defaultOpt.id) {
      return {
        nextMalleableBullets: nextMbList,
        nextAcceptedMalleableIds: acceptedMalleableIds.filter((id) => id !== targetMb.id),
        nextSelectedOptionMap: selectedOptionBySlotId,
      };
    }

    return {
      nextMalleableBullets: nextMbList,
      nextAcceptedMalleableIds: isCurrentlySelected
        ? acceptedMalleableIds
        : [...acceptedMalleableIds, targetMb.id],
      nextSelectedOptionMap: {
        ...selectedOptionBySlotId,
        [targetMb.id]: defaultOpt.id,
      },
    };
  }

  // Company wasn't in the 1-2 JD-matched cards; append a clean Default Pick slot card
  const job = resume.experience.find((j) => j.id === pick.containerId);
  const techSignals = job
    ? Array.from(new Set(job.bullets.flatMap((b) => b.tools))).slice(0, 6)
    : [];
  const existingBulletsText = job ? job.bullets.map((b) => plainText(b.text)).join(" ") : "";
  const tags = job?.tags && job.tags.length > 0 ? job.tags : inferDomainTags(`${pick.roleTitle} ${pick.companyName} ${existingBulletsText}`, techSignals);
  const domain = tags[0] ?? "general";

  const slotId = `malleable-default-${pick.companyKey || pick.containerId}`;
  const optId = `${slotId}-opt-default`;
  const opt: MalleableBulletOption = {
    id: optId,
    styleLabel: "Default Pick",
    markup: pick.markup,
    latex,
    chars,
    maxChars,
    widthNcu,
    fit,
    easyExplanation: `Saved Default Pick for ${pick.companyName} (shared across all job applications).`,
    isNewClaim: true,
    isDefaultPick: true,
    source: "default",
  };

  const believability = calculateDynamicBelievabilityScore({
    proposedKeywords: techSignals.slice(0, 2),
    containerKind: "experience",
    containerTitle: `${pick.roleTitle} · ${pick.companyName}`,
    domain,
    existingTechSignals: techSignals,
    existingBulletsText,
    actionStyle: "Default Pick",
    lineBudgetFit: fit,
  });

  const newCard: MalleableSynthesizedBullet = {
    id: slotId,
    targetContainerId: pick.containerId,
    targetContainerTitle: `${pick.roleTitle} · ${pick.companyName}`,
    targetContainerKind: "experience",
    targetTechContext: techSignals,
    tags,
    markup: pick.markup,
    latex,
    chars,
    maxChars,
    widthNcu,
    fit,
    injectedKeywords: techSignals.slice(0, 2),
    roleContextSummary: `${pick.roleTitle} at ${pick.companyName}`,
    believabilityScore: believability.score,
    believabilityCritique: believability.critique,
    scoreFeatures: believability.features,
    recommended: false,
    options: [opt],
  };

  return {
    nextMalleableBullets: [...malleableBullets, newCard],
    nextAcceptedMalleableIds: [...acceptedMalleableIds, slotId],
    nextSelectedOptionMap: {
      ...selectedOptionBySlotId,
      [slotId]: optId,
    },
  };
}
