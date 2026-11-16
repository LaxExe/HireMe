import { plainText, splitItems } from "../utils";
import { LARP_CATALOG } from "./catalog";
import { containsPhrase } from "./text";
import type { LarpTierClassification, MasterResume } from "./types";

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
    const inJd = item.aliases.some((a) => containsPhrase(jd, a));
    if (!inJd) continue;

    const inResume = item.aliases.some((a) => containsPhrase(resumeCorpus, a));
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
