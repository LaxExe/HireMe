import { splitItems, uid } from "../utils";
import { matchCategoryBucket, resolveTargetCategoryForSkill } from "./catalog";
import { SINGLE_LINE_NCU } from "./config";
import { computeVisualWidth } from "./text";
import type {
  LarpTierClassification,
  SkillCandidateOption,
  SkillCategory,
  SkillSwapChange,
} from "./types";

function formatCategoryLatexLine(categoryName: string, skillNames: string[]): string {
  return `\\textbf{${categoryName}:} ${skillNames.join(", ")}`;
}

export function getAvailableSkillCandidates(
  baseCategories: SkillCategory[],
  tiers: LarpTierClassification,
  skillSwaps: SkillSwapChange[],
  selectedSkillNames: string[] = [],
  customCategoryByName: Record<string, string> = {}
): SkillCandidateOption[] {
  const existingLower = new Set(
    baseCategories.flatMap((c) =>
      c.skills.flatMap((s) => [
        s.name.toLowerCase(),
        ...splitItems(s.name).map((p) => p.toLowerCase()),
      ])
    )
  );
  const bannedLower = new Set(tiers.tier_2_banned.map((b) => b.toLowerCase()));
  const recommendedAddedLower = new Set(
    skillSwaps.flatMap((s) => s.added).map((n) => n.toLowerCase())
  );

  const seenLower = new Set<string>();
  const out: SkillCandidateOption[] = [];

  const pushCandidate = (
    name: string,
    tier: SkillCandidateOption["tier"],
    allowIfInBase = false
  ) => {
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seenLower.has(key)) return;
    if (tier !== "custom" && bannedLower.has(key)) return;
    if (!allowIfInBase && existingLower.has(key)) return;

    const targetCat = resolveTargetCategoryForSkill(
      baseCategories,
      clean,
      customCategoryByName
    );
    if (!targetCat) return;

    seenLower.add(key);
    out.push({
      name: clean,
      tier,
      defaultSelected: recommendedAddedLower.has(key),
      recommendedSwap: recommendedAddedLower.has(key),
      targetCategoryId: targetCat.id,
      targetCategoryName: targetCat.name,
    });
  };

  for (const name of skillSwaps.flatMap((s) => s.added)) {
    pushCandidate(name, "tier_1_5_skills_only");
  }
  for (const name of tiers.tier_1_5_skills_only) {
    pushCandidate(name, "tier_1_5_skills_only");
  }
  for (const name of tiers.tier_1_framing) {
    pushCandidate(name, "tier_1_framing");
  }
  for (const name of selectedSkillNames) {
    pushCandidate(name, "custom", true);
  }

  return out;
}

function findBestSwapIndex(
  workingSkills: { id: string; name: string }[],
  matchedLower: Set<string>,
  newlyAdded: string[]
): number {
  for (let i = workingSkills.length - 1; i >= 0; i--) {
    const existingName = workingSkills[i].name;
    const isMatchedInJd =
      matchedLower.has(existingName.toLowerCase()) ||
      splitItems(existingName).some((part) => matchedLower.has(part.toLowerCase()));
    if (!isMatchedInJd && !newlyAdded.includes(existingName)) {
      return i;
    }
  }
  return -1;
}

export function applySelectedSkillsToResumeCategories(
  categories: SkillCategory[],
  tiers: LarpTierClassification,
  selectedSkillNames: string[],
  customCategoryByName?: Record<string, string>,
  singleLineNcu = SINGLE_LINE_NCU
): { updatedCategories: SkillCategory[]; changes: SkillSwapChange[] } {
  const cloned: SkillCategory[] = structuredClone(categories);
  const changes: SkillSwapChange[] = [];
  if (selectedSkillNames.length === 0) {
    return { updatedCategories: cloned, changes };
  }

  const matchedLower = new Set(tiers.matched.map((m) => m.toLowerCase()));
  const byCategoryId = new Map<string, string[]>();

  for (const rawName of selectedSkillNames) {
    const clean = rawName.trim();
    if (!clean) continue;
    const targetCat = resolveTargetCategoryForSkill(cloned, clean, customCategoryByName);
    if (!targetCat) continue;
    const list = byCategoryId.get(targetCat.id) ?? [];
    if (!list.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      list.push(clean);
      byCategoryId.set(targetCat.id, list);
    }
  }

  for (const cat of cloned) {
    const requested = byCategoryId.get(cat.id);
    if (!requested || requested.length === 0) continue;

    const origNames = cat.skills.map((s) => s.name);
    const origNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, origNames));
    const added: string[] = [];
    const swappedOut: string[] = [];
    const workingSkills = [...cat.skills];

    for (const candidateSkill of requested) {
      if (workingSkills.some((s) => s.name.toLowerCase() === candidateSkill.toLowerCase())) {
        continue;
      }

      const testAppendNames = [...workingSkills.map((s) => s.name), candidateSkill];
      const testAppendNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, testAppendNames));
      if (testAppendNcu <= singleLineNcu) {
        workingSkills.push({ id: uid("s"), name: candidateSkill });
        added.push(candidateSkill);
        continue;
      }

      const swapIdx = findBestSwapIndex(workingSkills, matchedLower, added);
      if (swapIdx >= 0) {
        const copyNames = workingSkills.map((s) => s.name);
        const removedName = copyNames[swapIdx];
        copyNames[swapIdx] = candidateSkill;
        const testSwapNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, copyNames));
        if (testSwapNcu <= singleLineNcu || testSwapNcu < testAppendNcu) {
          swappedOut.push(removedName);
          added.push(candidateSkill);
          workingSkills[swapIdx] = { id: uid("s"), name: candidateSkill };
          continue;
        }
      }

      workingSkills.push({ id: uid("s"), name: candidateSkill });
      added.push(candidateSkill);
    }

    if (added.length > 0 || swappedOut.length > 0) {
      cat.skills = workingSkills;
      const newNcu = computeVisualWidth(
        formatCategoryLatexLine(cat.name, workingSkills.map((s) => s.name))
      );
      changes.push({
        categoryId: cat.id,
        categoryName: cat.name,
        added,
        swappedOut,
        origNcu,
        newNcu,
      });
    }
  }

  return { updatedCategories: cloned, changes };
}

export function smartSwapSkillsSection(
  categories: SkillCategory[],
  tiers: LarpTierClassification,
  singleLineNcu = SINGLE_LINE_NCU,
  allowAdjacentLanguages = false
): { updatedCategories: SkillCategory[]; changes: SkillSwapChange[] } {
  const cloned: SkillCategory[] = structuredClone(categories);
  const changes: SkillSwapChange[] = [];

  const matchedLower = new Set(tiers.matched.map((m) => m.toLowerCase()));
  const bannedLower = new Set(tiers.tier_2_banned.map((b) => b.toLowerCase()));

  for (const cat of cloned) {
    const bucket = matchCategoryBucket(cat.name);
    if (bucket === "Languages" && !allowAdjacentLanguages) continue;

    const origNames = cat.skills.map((s) => s.name);
    const origNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, origNames));

    const candidatesForCat = tiers.tier_1_5_skills_only.filter((skillName) => {
      if (bannedLower.has(skillName.toLowerCase())) return false;
      const resolved = resolveTargetCategoryForSkill(cloned, skillName);
      if (resolved?.id === cat.id) {
        return !cat.skills.some((s) => s.name.toLowerCase() === skillName.toLowerCase());
      }
      return false;
    });

    const added: string[] = [];
    const swappedOut: string[] = [];
    const workingSkills = [...cat.skills];

    for (const candidateSkill of candidatesForCat) {
      const testAppendNames = [...workingSkills.map((s) => s.name), candidateSkill];
      const testAppendNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, testAppendNames));

      if (testAppendNcu <= singleLineNcu) {
        workingSkills.push({ id: uid("s"), name: candidateSkill });
        added.push(candidateSkill);
        continue;
      }

      const swapIdx = findBestSwapIndex(workingSkills, matchedLower, added);
      if (swapIdx >= 0) {
        const copyNames = workingSkills.map((s) => s.name);
        const removedName = copyNames[swapIdx];
        copyNames[swapIdx] = candidateSkill;
        const testSwapNcu = computeVisualWidth(formatCategoryLatexLine(cat.name, copyNames));
        if (testSwapNcu <= singleLineNcu) {
          swappedOut.push(removedName);
          added.push(candidateSkill);
          workingSkills[swapIdx] = { id: uid("s"), name: candidateSkill };
        }
      }
    }

    if (added.length > 0 || swappedOut.length > 0) {
      cat.skills = workingSkills;
      const newNcu = computeVisualWidth(
        formatCategoryLatexLine(cat.name, workingSkills.map((s) => s.name))
      );
      changes.push({
        categoryId: cat.id,
        categoryName: cat.name,
        added,
        swappedOut,
        origNcu,
        newNcu,
      });
    }
  }

  return { updatedCategories: cloned, changes };
}
