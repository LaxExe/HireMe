import fs from "node:fs";
import path from "node:path";
import { runLarpAlignmentPipeline } from "../../larpEngine";
import type { MasterResume } from "../../types";

const fixturesDir = path.join(process.cwd(), "src/lib/resume/larp/__fixtures__");
const masterResume = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "masterResume.json"), "utf8")
) as MasterResume;
const jds = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "jds.json"), "utf8")
) as Record<string, { id: string; title: string; text: string }>;

const snapshots: Record<string, unknown> = {};

for (const [key, jd] of Object.entries(jds)) {
  const run = runLarpAlignmentPipeline(jd.text, masterResume, 0);
  snapshots[key] = {
    tiers: run.tiers,
    skillSwaps: run.skillSwaps,
    updatedSkills: run.updatedSkills.map((c) => ({
      id: c.id,
      name: c.name,
      skills: c.skills.map((s) => s.name),
    })),
    bulletProposals: run.bulletProposals.map((bp) => ({
      bulletId: bp.bulletId,
      containerId: bp.containerId,
      contextCategory: bp.contextCategory,
      originalMarkup: bp.originalMarkup,
      mutatedMarkup: bp.mutatedMarkup,
      injectedKeywords: bp.injectedKeywords,
      reframedWords: bp.wordStats.reframedWords,
      candChars: bp.budget.candChars,
      candLines: bp.budget.candLines,
      candFitStatus: bp.budget.candFit.status,
    })),
    malleableBullets: run.malleableBullets.map((mb) => ({
      id: mb.id,
      targetContainerId: mb.targetContainerId,
      targetContainerTitle: mb.targetContainerTitle,
      markup: mb.markup,
      chars: mb.chars,
      injectedKeywords: mb.injectedKeywords,
      believabilityScore: mb.believabilityScore,
      optionCount: mb.options.length,
    })),
    guardrailVerifiedZeroBanned: run.guardrailVerifiedZeroBanned,
  };
}

fs.writeFileSync(
  path.join(fixturesDir, "v1Snapshots.json"),
  JSON.stringify(snapshots, null, 2) + "\n",
  "utf8"
);
console.log("Generated v1Snapshots.json successfully.");
