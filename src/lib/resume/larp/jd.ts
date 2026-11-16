import {
  containsToken,
  countTokenMentions,
  extractUnknownTechnicalTerms,
  matchJobDescriptionWithResume,
  segmentJobDescription,
} from "../keywordMatch";
import { plainText, splitItems } from "../utils";
import { LARP_CATALOG } from "./catalog";
import type { LarpTierClassification, MasterResume } from "./types";

export interface WeightedJdKeyword {
  id: string;
  label: string;
  weight: number;
  section: "required" | "preferred" | "general";
  weakMatchOnly: boolean;
}

export interface CoverageReport {
  beforePercent: number;
  afterPercent: number;
  weightedBeforePercent: number;
  weightedAfterPercent: number;
  unknownTerms: string[];
}

export function buildResumeCorpus(resume: MasterResume): string {
  const parts: string[] = [];
  for (const c of resume.skills) {
    parts.push(c.name, ...c.skills.map((s) => s.name), ...c.skills.flatMap((s) => splitItems(s.name)));
  }
  for (const j of resume.experience) {
    parts.push(j.title, j.company, ...j.bullets.map((b) => plainText(b.text)));
  }
  for (const p of resume.projects) {
    parts.push(p.name, ...p.techStack, ...p.bullets.map((b) => plainText(b.text)));
  }
  return parts.join(" \n ");
}

export function extractWeightedJdKeywords(jobDescription: string): Map<string, WeightedJdKeyword> {
  const jd = jobDescription.trim();
  const out = new Map<string, WeightedJdKeyword>();
  if (!jd) return out;

  const segments = segmentJobDescription(jd);

  for (const item of LARP_CATALOG) {
    const strongAliases = item.aliases.filter(
      (a) => !(item.weakAliases ?? []).includes(a)
    );
    const weakAliases = item.weakAliases ?? [];

    const strongHit = strongAliases.some((a) => containsToken(jd, a, false));
    const weakHit = !strongHit && weakAliases.some((a) => containsToken(jd, a, false));

    if (!strongHit && !weakHit) continue;

    const allAliases = item.aliases;
    const inReq = allAliases.some((a) => containsToken(segments.requiredSection, a, false));
    const inGen = allAliases.some((a) => containsToken(segments.generalSection, a, false));
    const inPref = allAliases.some((a) => containsToken(segments.preferredSection, a, false));

    let section: "required" | "preferred" | "general" = "general";
    let baseWeight = 0.7;
    if (inReq) {
      section = "required";
      baseWeight = 1.0;
    } else if (inGen) {
      section = "general";
      baseWeight = 0.7;
    } else if (inPref) {
      section = "preferred";
      baseWeight = 0.4;
    }

    const mentions = countTokenMentions(jd, allAliases);
    const repeatBonus = Math.min(0.3, Math.max(0, (mentions - 1) * 0.1));
    const inTitle = allAliases.some((a) => containsToken(segments.titleLine, a, false));
    const titleBonus = inTitle ? 0.2 : 0;

    let weight = Number((baseWeight + repeatBonus + titleBonus).toFixed(2));
    if (weakHit) {
      weight = Number((weight * 0.5).toFixed(2));
    }

    out.set(item.label.toLowerCase(), {
      id: item.id,
      label: item.label,
      weight,
      section,
      weakMatchOnly: weakHit,
    });
  }

  return out;
}

export function classifyJobDescriptionTiers(
  jobDescription: string,
  resume: MasterResume
): LarpTierClassification {
  const result: LarpTierClassification = {
    matched: [],
    tier_0_workflow: [],
    tier_1_framing: [],
    tier_1_5_skills_only: [],
    tier_2_banned: [],
  };

  const jd = jobDescription.trim();
  if (!jd) return result;

  const resumeCorpus = buildResumeCorpus(resume);

  for (const item of LARP_CATALOG) {
    const inJd = item.aliases.some((a) => containsToken(jd, a, false));
    if (!inJd) continue;

    const inResume = item.aliases.some((a) => containsToken(resumeCorpus, a, true));
    if (inResume) {
      result.matched.push(item.name);
      continue;
    }

    if (item.defaultTierIfMissing === "tier_0_workflow") {
      result.tier_0_workflow.push(item.name);
      if (item.alsoSkillsOnly) {
        result.tier_1_5_skills_only.push(item.name);
      }
    } else if (item.defaultTierIfMissing === "tier_1_framing") {
      result.tier_1_framing.push(item.name);
      if (item.alsoSkillsOnly) {
        result.tier_1_5_skills_only.push(item.name);
      }
    } else if (item.defaultTierIfMissing === "tier_1_5_skills_only") {
      result.tier_1_5_skills_only.push(item.name);
    } else if (item.defaultTierIfMissing === "tier_2_banned") {
      result.tier_2_banned.push(item.name);
    }
  }

  return result;
}

export function computeCoverageBeforeAfter(
  jobDescription: string,
  beforeResume: MasterResume,
  afterResume: MasterResume
): CoverageReport {
  const beforeMatch = matchJobDescriptionWithResume(jobDescription, beforeResume);
  const afterMatch = matchJobDescriptionWithResume(jobDescription, afterResume);

  return {
    beforePercent: beforeMatch.scorePercent,
    afterPercent: afterMatch.scorePercent,
    weightedBeforePercent: beforeMatch.weightedScorePercent ?? beforeMatch.scorePercent,
    weightedAfterPercent: afterMatch.weightedScorePercent ?? afterMatch.scorePercent,
    unknownTerms: beforeMatch.unknownTerms ?? [],
  };
}

export { extractUnknownTechnicalTerms };
