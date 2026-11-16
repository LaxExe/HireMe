import { LARP_CATALOG } from "./config";
import type { CatalogItem, SkillCategory } from "./types";

export { LARP_CATALOG };

export function matchCategoryBucket(
  catName: string
): "Languages" | "Frameworks & Libraries" | "Databases & Cloud" | "Developer Tools & DevOps" {
  const upper = catName.toUpperCase();
  if (/LANGUAGE/.test(upper)) return "Languages";
  if (/FRAMEWORK|LIBRAR/.test(upper)) return "Frameworks & Libraries";
  if (/DATABASE|CLOUD|DATA|STORAGE/.test(upper)) return "Databases & Cloud";
  return "Developer Tools & DevOps";
}

export function resolveTargetCategoryForSkill(
  categories: SkillCategory[],
  skillName: string,
  customCategoryByName?: Record<string, string>
): SkillCategory | undefined {
  if (categories.length === 0) return undefined;

  const customCat =
    customCategoryByName?.[skillName] ??
    Object.entries(customCategoryByName ?? {}).find(
      ([k]) => k.toLowerCase() === skillName.toLowerCase()
    )?.[1];
  if (customCat) {
    const direct = categories.find(
      (c) => c.id === customCat || c.name.toLowerCase() === customCat.toLowerCase()
    );
    if (direct) return direct;
  }

  const catalogEntry: CatalogItem | undefined = LARP_CATALOG.find(
    (c) => c.name.toLowerCase() === skillName.toLowerCase()
  );
  const targetBucket = catalogEntry?.targetSkillCategory ?? "Developer Tools & DevOps";

  return (
    categories.find((c) => matchCategoryBucket(c.name) === targetBucket) ??
    (targetBucket === "Databases & Cloud"
      ? categories.find((c) => matchCategoryBucket(c.name) === "Developer Tools & DevOps")
      : undefined) ??
    categories.find((c) => matchCategoryBucket(c.name) !== "Languages") ??
    categories[0]
  );
}
