import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { runLarpAlignmentPipeline, type LarpAlignmentRun } from "../../larpEngine";
import type { MasterResume } from "../../types";
import { escapeRegExp, plainText } from "../../utils";

const fixturesDir = path.join(process.cwd(), "src/lib/resume/larp/__fixtures__");
const masterResume = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "masterResume.json"), "utf8")
) as MasterResume;
const jds = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "jds.json"), "utf8")
) as Record<string, { id: string; title: string; text: string }>;
const v1Snapshots = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "v1Snapshots.json"), "utf8")
) as Record<string, unknown>;

function containsPhrase(haystack: string, phrase: string): boolean {
  const clean = phrase.trim();
  if (!clean) return false;
  const re = new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegExp(clean)}(?![A-Za-z0-9+#])`, "i");
  return re.test(haystack);
}

function extractNumbers(markup: string): string[] {
  const text = plainText(markup);
  const matches = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?(?:%|x|Hz|\+)?\b/gi);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

function summarizeRun(run: LarpAlignmentRun) {
  return {
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

describe("LARP Engine — Golden Snapshots & Non-Negotiable Invariants", () => {
  for (const [key, jd] of Object.entries(jds)) {
    const run = runLarpAlignmentPipeline(jd.text, masterResume, 0);

    it(`[${key}] matches golden v1 snapshot`, () => {
      const actual = summarizeRun(run);
      assert.deepStrictEqual(actual, v1Snapshots[key]);
    });

    it(`[${key}] Invariant 1: no tier_2_banned term introduced anywhere`, () => {
      assert.strictEqual(run.guardrailVerifiedZeroBanned, true);
      const allOutputText = [
        ...run.updatedSkills.flatMap((c) => c.skills.map((s) => s.name)),
        ...run.bulletProposals.map((bp) => plainText(bp.mutatedMarkup)),
        ...run.malleableBullets.flatMap((mb) => [
          plainText(mb.markup),
          ...mb.options.map((o) => plainText(o.markup)),
        ]),
      ].join(" \n ");

      for (const banned of run.tiers.tier_2_banned) {
        assert.strictEqual(
          containsPhrase(allOutputText, banned),
          false,
          `Banned term "${banned}" appeared in output for ${key}`
        );
      }
    });

    it(`[${key}] Invariant 2: no pure tier_1_5_skills_only term injected into any bullet`, () => {
      const framingOrWorkflow = new Set(
        [...run.tiers.tier_0_workflow, ...run.tiers.tier_1_framing].map((k) => k.toLowerCase())
      );
      const pureSkillsOnly = run.tiers.tier_1_5_skills_only.filter(
        (k) => !framingOrWorkflow.has(k.toLowerCase())
      );

      for (const bp of run.bulletProposals) {
        const origText = plainText(bp.originalMarkup);
        const mutText = plainText(bp.mutatedMarkup);
        for (const skillOnlyTerm of pureSkillsOnly) {
          if (!containsPhrase(origText, skillOnlyTerm)) {
            assert.strictEqual(
              containsPhrase(mutText, skillOnlyTerm),
              false,
              `Skills-only term "${skillOnlyTerm}" leaked into mutated bullet ${bp.bulletId}`
            );
          }
        }
      }

      for (const mb of run.malleableBullets) {
        for (const opt of mb.options) {
          const optText = plainText(opt.markup);
          for (const skillOnlyTerm of pureSkillsOnly) {
            assert.strictEqual(
              containsPhrase(optText, skillOnlyTerm),
              false,
              `Skills-only term "${skillOnlyTerm}" leaked into malleable bullet ${opt.id}`
            );
          }
        }
      }
    });

    it(`[${key}] Invariant 3: word diff <= 7 on every bullet edit`, () => {
      for (const bp of run.bulletProposals) {
        assert.ok(
          bp.wordStats.reframedWords > 0 && bp.wordStats.reframedWords <= 7,
          `Bullet ${bp.bulletId} changed ${bp.wordStats.reframedWords} words (cap is 7)`
        );
        assert.strictEqual(bp.wordStats.withinCap, true);
      }
    });

    it(`[${key}] Invariant 4: all numbers and metrics in original bullets are preserved`, () => {
      for (const bp of run.bulletProposals) {
        const origNums = extractNumbers(bp.originalMarkup);
        const candNums = extractNumbers(bp.mutatedMarkup);
        for (const n of origNums) {
          assert.ok(
            candNums.includes(n),
            `Metric/number "${n}" missing in mutated bullet ${bp.bulletId}: "${bp.mutatedMarkup}"`
          );
        }
      }
    });

    it(`[${key}] Invariant 5: no bullet edit or malleable bullet overflows beyond 2 lines`, () => {
      const twoLineMax = masterResume.calibration?.twoLineMax ?? 216;
      const oneLineMax = masterResume.calibration?.oneLineMax ?? 108;

      for (const bp of run.bulletProposals) {
        assert.notStrictEqual(bp.budget.candFit.status, "overflow");
        assert.ok(
          bp.budget.candChars <= twoLineMax,
          `Bullet ${bp.bulletId} chars ${bp.budget.candChars} > ${twoLineMax}`
        );
        assert.ok(bp.budget.candLines <= 2);
      }

      for (const mb of run.malleableBullets) {
        assert.ok(
          mb.chars <= oneLineMax,
          `Malleable bullet ${mb.id} chars ${mb.chars} > ${oneLineMax}`
        );
        for (const opt of mb.options) {
          assert.ok(
            opt.chars <= oneLineMax,
            `Malleable option ${opt.id} chars ${opt.chars} > ${oneLineMax}`
          );
        }
      }
    });

    it(`[${key}] Invariant 6: no bullet is edited by more than one keyword per run`, () => {
      const seenBulletIds = new Set<string>();
      for (const bp of run.bulletProposals) {
        assert.strictEqual(
          seenBulletIds.has(bp.bulletId),
          false,
          `Bullet ${bp.bulletId} was mutated more than once`
        );
        seenBulletIds.add(bp.bulletId);
        assert.strictEqual(
          bp.injectedKeywords.length,
          1,
          `Bullet ${bp.bulletId} had multiple injected keywords: ${bp.injectedKeywords.join(", ")}`
        );
      }
    });
  }

  it("Phase 3: data-driven catalog, policy modes, auto-tagger, and zero resume-specific strings", async () => {
    const {
      autoTagResumeContainers,
      buildResumeInventory,
      catalogFromDictionary,
      findCatalogEntry,
      placementFor,
      synthesizeMalleableOneLineBullets,
    } = await import("../../larpEngine");

    const fullCat = catalogFromDictionary(true);
    assert.ok(fullCat.length >= 90, "Extended catalog merges TECH_DICTIONARY entries");

    const inv = buildResumeInventory(masterResume);
    const awsEntry = findCatalogEntry("AWS");
    assert.ok(awsEntry);
    assert.strictEqual(placementFor(awsEntry, inv, "framing"), "bullet");
    assert.strictEqual(placementFor(awsEntry, inv, "evidence"), "confirm");

    const rustEntry = findCatalogEntry("Rust");
    assert.ok(rustEntry);
    assert.strictEqual(placementFor(rustEntry, inv, "framing"), "blocked");
    assert.strictEqual(placementFor(rustEntry, inv, "evidence"), "blocked");

    const tagged = autoTagResumeContainers(masterResume);
    assert.ok(tagged.experience[0].tags?.includes("ml"));
    assert.ok(tagged.projects[0].tags?.includes("systems"));

    const zeroMalleable = synthesizeMalleableOneLineBullets(
      masterResume,
      {
        matched: [],
        tier_0_workflow: ["Agile"],
        tier_1_framing: ["Redis"],
        tier_1_5_skills_only: [],
        tier_2_banned: [],
      },
      0
    );
    assert.strictEqual(zeroMalleable.length, 0);
  });

  describe("Phase 4: Single-Source-of-Truth validateRewrite Guardrails", () => {
    const baseOrig =
      "Processed inbound event streams using **LLM** prompt engineering across **5** services, reducing latency by **35%**.";

    it("accepts a clean, compliant rewrite", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const cand =
        "Processed inbound event streams using **LLM** prompts on **AWS** across **5** services, reducing latency by **35%**.";
      const violations = validateRewrite(baseOrig, cand, "AWS", ctx);
      assert.strictEqual(violations.length, 0);
    });

    it("rejects banned_term (tier-2 or tier-1.5 tech not in original)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const candBanned =
        "Processed inbound event streams using **Rust** and **AWS** across **5** services, reducing latency by **35%**.";
      const v1 = validateRewrite(baseOrig, candBanned, "AWS", ctx);
      assert.ok(v1.some((v) => v.code === "banned_term"), "Should flag Rust as banned_term");

      const candSkillsOnly =
        "Processed inbound event streams using **MongoDB** and **AWS** across **5** services, reducing latency by **35%**.";
      const v2 = validateRewrite(baseOrig, candSkillsOnly, "AWS", ctx);
      assert.ok(v2.some((v) => v.code === "banned_term"), "Should flag MongoDB as banned_term");
    });

    it("rejects new_tech (non-target tech introduced)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext({
        matched: ["React"],
        tier_0_workflow: [],
        tier_1_framing: ["AWS", "Redis"],
        tier_1_5_skills_only: [],
        tier_2_banned: [],
      });
      const cand =
        "Processed inbound event streams with **Redis** on **AWS** across **5** services, reducing latency by **35%**.";
      const violations = validateRewrite(baseOrig, cand, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "new_tech"));
    });

    it("rejects missing_keyword (target keyword absent)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const cand =
        "Processed inbound event streams with **LLM** prompts across **5** services, reducing latency by **35%**.";
      const violations = validateRewrite(baseOrig, cand, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "missing_keyword"));
    });

    it("rejects no_change (word diff is 0)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const origWithAws =
        "Processed inbound event streams on **AWS** across **5** services, reducing latency by **35%**.";
      const violations = validateRewrite(origWithAws, origWithAws, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "no_change"));
    });

    it("rejects too_many_changes (word diff > 7)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const cand =
        "Completely architected brand new distributed cloud event streams on **AWS** with custom workers across **5** services, reducing latency by **35%**.";
      const violations = validateRewrite(baseOrig, cand, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "too_many_changes"));
    });

    it("rejects metric_changed (number or percentage missing/altered)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const cand =
        "Processed inbound event streams using **LLM** prompts on **AWS** across **5** services, reducing latency by **50%**.";
      const violations = validateRewrite(baseOrig, cand, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "metric_changed"));
    });

    it("rejects overflow (> 2 lines / twoLineMax)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const longOrig = `${baseOrig} Built modular validation layers and automated schema verification pipelines across internal service endpoints to maintain strict reliability SLAs.`;
      const cand = `${longOrig.replace(/\.$/, "")} deployed on **AWS** with multi-region failover and real-time observability dashboards.`;
      const violations = validateRewrite(longOrig, cand, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "overflow"));
    });

    it("rejects line_growth (grew from 1L to 2L orphan without landing in green zone)", async () => {
      const { createGuardContext, validateRewrite } = await import("../../larpEngine");
      const ctx = createGuardContext();
      const oneLinerOrig =
        "Built backend event stream pipelines using **LLM** prompt engineering across **5** services, cutting latency **35%**.";
      const orphan2Cand =
        "Built backend event stream pipelines using **LLM** prompt engineering across **5** services on **AWS**, cutting latency **35%**.";
      const violations = validateRewrite(oneLinerOrig, orphan2Cand, "AWS", ctx);
      assert.ok(violations.some((v) => v.code === "line_growth"));
    });
  });
});
