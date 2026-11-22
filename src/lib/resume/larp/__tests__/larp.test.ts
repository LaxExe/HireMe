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

  describe("Phase 5: Keyword Matcher Fixes (Ambiguous, Weak, Weighted & Unknown Terms)", () => {
    it("does NOT match Go or REST on a JD containing 'go to market' and 'the rest of the team'", async () => {
      const { matchJobDescriptionWithResume } = await import("../../keywordMatch");
      const { classifyJobDescriptionTiers } = await import("../../larpEngine");

      const proseJd = `Product Manager / Engineer
We are looking for someone to help us go to market quickly and collaborate with the rest of the team.
You will work closely with stakeholders in spring 2026 to deliver swift action on customer feedback.`;

      const matchRes = matchJobDescriptionWithResume(proseJd, masterResume);
      const allDetectedNames = [
        ...matchRes.matched.map((m) => m.name),
        ...matchRes.missing.map((m) => m.name),
      ];
      assert.ok(!allDetectedNames.includes("Go"), "Should not match Go in 'go to market'");
      assert.ok(!allDetectedNames.includes("REST APIs"), "Should not match REST in 'rest of the team'");
      assert.ok(!allDetectedNames.includes("Spring Boot"), "Should not match Spring in 'spring 2026'");
      assert.ok(!allDetectedNames.includes("Swift"), "Should not match Swift in 'swift action'");

      const tiers = classifyJobDescriptionTiers(proseJd, masterResume);
      assert.ok(!tiers.tier_2_banned.includes("Golang"));
      assert.ok(!tiers.matched.includes("REST APIs"));
    });

    it("matches ambiguous aliases when properly capitalized in a technical list", async () => {
      const { matchJobDescriptionWithResume } = await import("../../keywordMatch");
      const techJd = `Backend Engineer
Required Qualifications:
- Experience programming in Go, R, C, TS, and JS.
- Building services with Node, Spring, Rails, and REST.`;

      const matchRes = matchJobDescriptionWithResume(techJd, masterResume);
      const allDetectedNames = [
        ...matchRes.matched.map((m) => m.name),
        ...matchRes.missing.map((m) => m.name),
      ];
      assert.ok(allDetectedNames.includes("Go"));
      assert.ok(allDetectedNames.includes("R"));
      assert.ok(allDetectedNames.includes("C"));
      assert.ok(allDetectedNames.includes("TypeScript"));
      assert.ok(allDetectedNames.includes("JavaScript"));
      assert.ok(allDetectedNames.includes("Node.js"));
      assert.ok(allDetectedNames.includes("Spring Boot"));
      assert.ok(allDetectedNames.includes("Ruby on Rails"));
      assert.ok(allDetectedNames.includes("REST APIs"));
    });

    it("halves weight for weak aliases and assigns higher weight to required vs preferred sections", async () => {
      const { matchJobDescriptionWithResume } = await import("../../keywordMatch");
      const weightedJd = `Backend Python Engineer
Required Qualifications:
- Strong proficiency in Python and PostgreSQL.
Preferred Qualifications:
- Familiarity with Redis and S3.`;

      const matchRes = matchJobDescriptionWithResume(weightedJd, masterResume);
      const pyItem = matchRes.matched.find((m) => m.name === "Python");
      const redisItem = matchRes.missing.find((m) => m.name === "Redis");
      const awsItem = matchRes.missing.find((m) => m.name === "AWS");

      assert.ok(pyItem && pyItem.weight && pyItem.weight >= 1.2, "Python in title + required gets >= 1.2");
      assert.ok(redisItem && redisItem.weight === 0.4, "Redis in preferred gets 0.4");
      assert.ok(awsItem && awsItem.weight === 0.2, "AWS matched only via weak alias 'S3' in preferred gets 0.4 * 0.5 = 0.2");
    });

    it("surfaces unknown capitalized/camelCase JD terms and preserves dynamic skill category", async () => {
      const { matchJobDescriptionWithResume } = await import("../../keywordMatch");
      const customResume = structuredClone(masterResume);
      customResume.skills[0].skills.push({ id: "s_zig", name: "Zig" });

      const jdWithUnknown = `Systems Engineer
Requirements:
- Experience with Zig, ClickHouse, and Temporal.io for workflow orchestration.`;

      const matchRes = matchJobDescriptionWithResume(jdWithUnknown, customResume);
      const zigMatch = matchRes.matched.find((m) => m.name === "Zig");
      assert.ok(zigMatch, "Dynamic skill Zig should be matched");
      assert.strictEqual(zigMatch.category, "Languages", "Dynamic skill takes category from its skills section");
      assert.ok(matchRes.unknownTerms?.includes("ClickHouse"));
      assert.ok(matchRes.unknownTerms?.includes("Temporal.io"));
    });
  });

  describe("Phase 6: Plausibility Gate", () => {
    it("blocks a C++ motion-planner bullet from receiving a Tailwind CSS or Redis injection", async () => {
      const { checkSlotPlausibility } = await import("../../larpEngine");
      const cppMotionSlot = {
        bullet: {
          id: "b_cpp",
          text: "Implemented **C++** **ROS 2** occupancy-grid mapping and path planning in simulation at **20Hz**.",
          tools: ["C++", "ROS 2"],
          metrics: ["20Hz"],
        },
        context: "systems-cpp-robotics" as const,
        tags: ["systems" as const],
        containerStack: ["C++", "ROS 2", "Gazebo"],
      };

      const twCheck = checkSlotPlausibility(cppMotionSlot, "Tailwind CSS");
      assert.strictEqual(twCheck.ok, false);
      assert.strictEqual(twCheck.reason, "systems_context");

      const redisCheck = checkSlotPlausibility(cppMotionSlot, "Redis");
      assert.strictEqual(redisCheck.ok, false);
    });

    it("rejects implausible domain pairings (e.g. Tailwind CSS on a pure backend/ML bullet without React/HTML/CSS)", async () => {
      const { checkSlotPlausibility } = await import("../../larpEngine");
      const backendSlot = {
        bullet: {
          id: "b_py",
          text: "Trained **PyTorch** models across compute clusters to predict permeability with **96%** accuracy.",
          tools: ["PyTorch"],
          metrics: ["96%"],
        },
        context: "backend-api-db" as const,
        tags: ["ml" as const],
        containerStack: ["Python", "PyTorch"],
      };

      const twCheck = checkSlotPlausibility(backendSlot, "Tailwind CSS");
      assert.strictEqual(twCheck.ok, false);
      assert.strictEqual(twCheck.reason, "implausible_slot");
    });

    it("awards pairsWithHit when bullet or container uses a paired technology (e.g. Redis with PostgreSQL)", async () => {
      const { checkSlotPlausibility } = await import("../../larpEngine");
      const pgSlot = {
        bullet: {
          id: "b_pg",
          text: "Developed **REST APIs** and relational **PostgreSQL** schemas across **5** internal services.",
          tools: ["REST APIs", "PostgreSQL"],
          metrics: ["5"],
        },
        context: "backend-api-db" as const,
        tags: ["backend" as const],
        containerStack: ["PostgreSQL", "REST APIs"],
      };

      const redisCheck = checkSlotPlausibility(pgSlot, "Redis");
      assert.strictEqual(redisCheck.ok, true);
      assert.strictEqual(redisCheck.pairsWithHit, true);
      assert.strictEqual(redisCheck.contextOverlap, true);
    });
  });

  describe("Phase 7: LLM Candidate Proposer & Guardrail Filtering", () => {
    const base = "Deployed the app to **Supabase**.";
    const singleBulletResume: MasterResume = {
      ...masterResume,
      experience: [
        {
          id: "job_supa",
          title: "Backend Software Engineer",
          company: "CloudApp",
          companyUrl: "",
          location: "Remote",
          dates: "2026",
          tags: ["backend", "infra"],
          bullets: [
            {
              id: "b_supa",
              text: base,
              tools: ["Supabase"],
              metrics: [],
            },
          ],
        },
      ],
      projects: [],
    };

    const fakeCompleter =
      (rewrites: unknown) =>
      async (): Promise<string> =>
        JSON.stringify({ rewrites });

    const cases: [string, unknown, boolean][] = [
      ["compliant rewrite", ["Deployed the app to **Supabase** on **AWS**."], true],
      [
        "adds banned tech",
        ["Deployed the app to **Supabase** on **AWS** with **Kubernetes**."],
        false,
      ],
      ["drops the keyword", ["Deployed the app to **Supabase** quickly."], false],
      [
        "changes a number",
        ["Deployed the app to **Supabase** on **AWS** for 50 users."],
        false,
      ],
      [
        "too many words changed",
        [
          "Architected and shipped a scalable production system on **AWS** powered by **Supabase** infrastructure.",
        ],
        false,
      ],
      ["no change at all", [base], false],
      [
        "overflows the line budget",
        ["Deployed the app to **Supabase** on **AWS** ".repeat(8)],
        false,
      ],
    ];

    for (const [name, out, ok] of cases) {
      it(`LLM validation case: ${name}`, async () => {
        const {
          clearLlmRewriteCache,
          proposeAndValidateLlmBulletCandidates,
          runLarpAlignmentPipelineAsync,
        } = await import("../../larpEngine");
        clearLlmRewriteCache();

        const tiers = {
          matched: ["Supabase"],
          tier_0_workflow: [],
          tier_1_framing: ["AWS"],
          tier_1_5_skills_only: ["AWS"],
          tier_2_banned: ["Kubernetes"],
        };
        const slot = {
          bullet: singleBulletResume.experience[0].bullets[0],
          containerId: "job_supa",
          containerTitle: "Backend Software Engineer · CloudApp",
          containerKind: "experience" as const,
          containerStack: ["Supabase"],
          context: "cloud-deploy-infra" as const,
          tags: ["backend" as const, "infra" as const],
          defensibilityBonus: 0,
          origPlainLen: base.length,
          maxAllowedChars: 108,
          charSlack: 108 - base.length,
        };

        const { candidates, telemetry } = await proposeAndValidateLlmBulletCandidates({
          slots: [slot],
          keywords: ["AWS"],
          tiers,
          cal: { oneLineMax: 108, twoLineMax: 216, malleableLines: 1 },
          completer: fakeCompleter(out),
          resume: singleBulletResume,
        });

        assert.strictEqual(candidates.length > 0, ok);
        if (ok) {
          assert.strictEqual(telemetry.survivedCount, 1);
          assert.strictEqual(telemetry.survivalRate, 1);
        } else {
          assert.strictEqual(telemetry.survivedCount, 0);
        }

        const run = await runLarpAlignmentPipelineAsync(
          "Requirements:\nAWS, Kubernetes",
          singleBulletResume,
          { llm: fakeCompleter(out) }
        );
        assert.ok(
          run.aiRecommendation?.verificationPasses.every((c) => c.status === "passed")
        );
      });
    }

    it("survives malformed output and falls back to rules cleanly", async () => {
      const { clearLlmRewriteCache, runLarpAlignmentPipelineAsync } = await import(
        "../../larpEngine"
      );
      clearLlmRewriteCache();
      const run = await runLarpAlignmentPipelineAsync(
        "Requirements:\nAWS",
        singleBulletResume,
        { llm: async () => "not json {{" }
      );
      assert.ok(
        run.aiRecommendation?.verificationPasses.every((c) => c.status === "passed")
      );
    });

    it("survives a thrown error and still populates diagnostics", async () => {
      const { clearLlmRewriteCache, runLarpAlignmentPipelineAsync } = await import(
        "../../larpEngine"
      );
      clearLlmRewriteCache();
      const run = await runLarpAlignmentPipelineAsync(
        "Requirements:\nAWS",
        singleBulletResume,
        {
          llm: async () => {
            throw new Error("boom");
          },
        }
      );
      assert.ok(run.diagnostics.length > 0);
    });

    it("keeps JD text out of buildPrompt, supports judge (1-5 -> ±8 pts), and supports DRAFT_SYSTEM malleable drafting", async () => {
      const {
        buildPrompt,
        draftAndValidateLlmMalleableOptions,
        judge,
        selectEligibleContainersForMalleableLines,
      } = await import("../../larpEngine");

      const prompt = buildPrompt({
        bullet: base,
        keyword: "AWS",
        containerTitle: "Backend Engineer · CloudApp",
        stack: ["Supabase", "TypeScript"],
        tags: ["backend", "infra"],
        styleRefs: ["Built **REST APIs** for billing."],
        forbidden: ["Kubernetes", "Rust"],
        maxWordChanges: 7,
        maxChars: 108,
      });

      assert.ok(prompt.system.includes("Output JSON only"));
      assert.ok(prompt.user.includes("Technology: AWS | N=7 | max 108 characters"));
      assert.ok(!prompt.user.includes("Requirements:"));

      const ratings = await judge(
        async () => '{"scores":[5, 1]}',
        base,
        ["Cand 1", "Cand 2"]
      );
      assert.deepStrictEqual(ratings, [5, 1]);

      const containers = selectEligibleContainersForMalleableLines(masterResume);
      const drafted = await draftAndValidateLlmMalleableOptions({
        container: containers[0],
        containerIdx: 0,
        targetKeywords: ["Docker"],
        tiers: {
          matched: ["Python", "PyTorch"],
          tier_0_workflow: [],
          tier_1_framing: ["Docker"],
          tier_1_5_skills_only: ["Docker"],
          tier_2_banned: ["Rust"],
        },
        completer: async () =>
          JSON.stringify({
            rewrites: [
              "Configured **Docker** containers in **Python** to standardize model evaluation and inference workflows.",
              "Built **Docker** pipelines with **Rust** across 500 nodes.", // rejected: banned tech + number
            ],
          }),
      });
      assert.strictEqual(drafted.length, 1);
      assert.strictEqual(drafted[0].source, "llm");
      assert.strictEqual(drafted[0].isNewClaim, true);
    });
  });

  describe("Phase 8: Global Max-Weight Assignment (Hungarian) & Regenerate with Exclude", () => {
    it("globally optimizes when two keywords compete for the same bullet and returns a different plan on regenerate with excludePairs", async () => {
      const { runLarpAlignmentPipeline, solveMaxWeightAssignment } = await import(
        "../../larpEngine"
      );

      // Direct unit test of Hungarian max-weight assignment where greedy would fail:
      // Row 0 (Keyword A): Slot 0 = 100, Slot 1 = 90
      // Row 1 (Keyword B): Slot 0 = 98,  Slot 1 = 0
      // Greedy picks (0->0, 1->unassigned) = 100. Global optimal picks (0->1, 1->0) = 188!
      const weights = [
        [100, 90, 0, 0],
        [98, 0, 0, 0],
      ];
      const assign = solveMaxWeightAssignment(weights);
      assert.strictEqual(assign[0], 1, "Keyword A should take Slot 1 so Keyword B can take Slot 0");
      assert.strictEqual(assign[1], 0, "Keyword B should take Slot 0");

      // Full pipeline check on ml_platform where Redis and GraphQL compete for b_rf_2
      const run1 = runLarpAlignmentPipeline(jds.ml_platform.text, masterResume, 0);
      assert.strictEqual(
        run1.bulletProposals.length,
        5,
        "Global assignment assigns all 5 keywords (AWS, Redis, GraphQL, Docker, Jira) instead of greedy's 2"
      );

      // Build exclude set from run1's assignments and verify regenerate returns a different plan
      const excludePairs = new Set(
        run1.bulletProposals.map(
          (bp) => `${bp.bulletId}|${bp.injectedKeywords[0].toLowerCase()}`
        )
      );
      const run2 = runLarpAlignmentPipeline(jds.ml_platform.text, masterResume, {
        excludePairs,
      });

      const plan1Key = run1.bulletProposals
        .map((bp) => `${bp.bulletId}:${bp.injectedKeywords[0]}`)
        .sort()
        .join(",");
      const plan2Key = run2.bulletProposals
        .map((bp) => `${bp.bulletId}:${bp.injectedKeywords[0]}`)
        .sort()
        .join(",");
      assert.notStrictEqual(plan1Key, plan2Key, "Regenerate with excludePairs must produce a different assignment plan");
    });
  });

  describe("Phase 9: Real Explainable Scoring & Real Verification Checks", () => {
    it("computes additive feature breakdown (naturalness, JD weight, minimalEdit, lineFit, domainFit, pairsWith, harderToVerify) without arbitrary 88-98 clamping", async () => {
      const { scoreCandidate } = await import("../../larpEngine");
      const features = scoreCandidate({
        ruleScore: 98,
        jdWeight: 1.0,
        wordsChanged: 2,
        fit: {
          length: 97,
          status: "ideal-1",
          targetLines: 1,
          line1Progress: 0.9,
          line2Progress: 0,
          overallRatio: 0.45,
          label: "1 line full",
          tooltip: "",
          badge: "1L",
          tone: "green",
        },
        domainOverlap: true,
        pairsWithHit: true,
        containerKind: "project",
      });

      assert.strictEqual(features.rewriteNaturalness, 49);
      assert.strictEqual(features.jdImportance, 20);
      assert.strictEqual(features.minimalEdit, -4);
      assert.strictEqual(features.lineFit, 10);
      assert.strictEqual(features.domainFit, 8);
      assert.strictEqual(features.pairsWithBonus, 10);
      assert.strictEqual(features.harderToVerifyBonus, 4);
      assert.strictEqual(features.total, 97);
    });

    it("runs 6 real verification checks and marks the run as failed if any check fails (e.g., tier-1.5 leakage or duplicate bullets)", async () => {
      const { runLarpAlignmentPipeline, runRealVerificationPasses } = await import(
        "../../larpEngine"
      );

      const cleanRun = runLarpAlignmentPipeline(jds.pylon_fullstack.text, masterResume, 0);
      assert.ok(cleanRun.aiRecommendation);
      assert.strictEqual(cleanRun.aiRecommendation.verified, true);
      assert.strictEqual(cleanRun.aiRecommendation.verificationPasses.length, 6);
      assert.ok(
        cleanRun.aiRecommendation.verificationPasses.every((p) => p.status === "passed")
      );

      // Now inject a deliberate Tier-1.5 skills-only leak (MongoDB) and a duplicate bullet
      const badProposal = structuredClone(cleanRun.bulletProposals[0]);
      badProposal.mutatedMarkup =
        "Processed inbound event streams with **MongoDB** and **AWS** across **5** services.";

      const failedCheck = runRealVerificationPasses({
        jobDescription: jds.pylon_fullstack.text,
        baseResume: masterResume,
        updatedSkills: cleanRun.updatedSkills,
        tiers: {
          ...cleanRun.tiers,
          tier_1_5_skills_only: [...cleanRun.tiers.tier_1_5_skills_only, "MongoDB"],
        },
        bulletProposals: [badProposal],
        malleableBullets: cleanRun.malleableBullets,
      });

      assert.strictEqual(failedCheck.allPassed, false);
      const check1 = failedCheck.passes.find((p) => p.passNumber === 1);
      const check3 = failedCheck.passes.find((p) => p.passNumber === 3);
      assert.strictEqual(check1?.status, "failed");
      assert.strictEqual(check3?.status, "failed");
    });
  });

  describe("Phase 10: Diagnostics for Every Keyword (Zero Silent Failures)", () => {
    it("produces a diagnostic status and human-readable reason for every JD keyword across all statuses", async () => {
      const { buildKeywordDiagnostics, runLarpAlignmentPipeline } = await import(
        "../../larpEngine"
      );

      for (const [key, jd] of Object.entries(jds)) {
        const run = runLarpAlignmentPipeline(jd.text, masterResume, 0);
        const allUniqueJdKeywords = new Set([
          ...run.tiers.matched,
          ...run.tiers.tier_0_workflow,
          ...run.tiers.tier_1_framing,
          ...run.tiers.tier_1_5_skills_only,
          ...run.tiers.tier_2_banned,
        ]);

        assert.strictEqual(
          run.diagnostics.length,
          allUniqueJdKeywords.size,
          `Every unique JD keyword in ${key} must have exactly one diagnostic entry`
        );

        for (const diag of run.diagnostics) {
          assert.ok(diag.reason.length > 5, `Diagnostic for ${diag.keyword} has reason`);
        }
      }

      // Verify specific statuses on pylon_fullstack:
      const pylonRun = runLarpAlignmentPipeline(jds.pylon_fullstack.text, masterResume, 0);
      const byKw = new Map(pylonRun.diagnostics.map((d) => [d.keyword, d]));

      assert.strictEqual(byKw.get("Python")?.status, "already_covered");
      assert.strictEqual(byKw.get("Rust")?.status, "blocked");
      assert.strictEqual(byKw.get("AWS")?.status, "applied");
      assert.strictEqual(byKw.get("Redis")?.status, "applied");
      assert.strictEqual(byKw.get("Docker")?.status, "applied");
      assert.strictEqual(byKw.get("Tailwind CSS")?.status, "all_rejected");

      // Verify no_candidate, all_rejected, outcompeted, and needs_confirmation statuses
      const customStats = new Map([
        [
          "webhooks",
          {
            keyword: "Webhooks",
            implausibleSlotsCount: 2,
            noRuleMatchSlotsCount: 4,
            rejectionCountsByCode: {},
            validCandidateCount: 0,
          },
        ],
        [
          "graphql",
          {
            keyword: "GraphQL",
            implausibleSlotsCount: 1,
            noRuleMatchSlotsCount: 2,
            rejectionCountsByCode: { too_many_changes: 3, overflow: 1 },
            validCandidateCount: 0,
          },
        ],
        [
          "docker",
          {
            keyword: "Docker",
            implausibleSlotsCount: 1,
            noRuleMatchSlotsCount: 0,
            rejectionCountsByCode: {},
            validCandidateCount: 2,
          },
        ],
      ]);

      const customDiags = buildKeywordDiagnostics({
        tiers: {
          matched: ["Python"],
          tier_0_workflow: [],
          tier_1_framing: ["Webhooks", "GraphQL", "Docker"],
          tier_1_5_skills_only: ["MongoDB"],
          tier_2_banned: ["Rust"],
        },
        skillSwaps: [],
        bulletProposals: [],
        candidateStats: customStats,
        keywordWeights: new Map(),
        resume: masterResume,
        mode: "framing",
      });

      const whDiag = customDiags.find((d) => d.keyword === "Webhooks");
      assert.strictEqual(whDiag?.status, "no_candidate");
      assert.strictEqual(
        whDiag?.reason,
        "No rewrite rule matched. 2 bullets were skipped as implausible. Add a rule or pairsWith, or enable the LLM proposer."
      );

      const gqlDiag = customDiags.find((d) => d.keyword === "GraphQL");
      assert.strictEqual(gqlDiag?.status, "all_rejected");
      assert.ok(gqlDiag?.reason.includes("too_many_changes×3, overflow×1"));

      const dockerDiag = customDiags.find((d) => d.keyword === "Docker");
      assert.strictEqual(dockerDiag?.status, "outcompeted");

      const mongoDiag = customDiags.find((d) => d.keyword === "MongoDB");
      assert.strictEqual(mongoDiag?.status, "skills_only");

      // Verify evidence mode needs_confirmation
      const evidenceDiags = buildKeywordDiagnostics({
        tiers: {
          matched: ["Python"],
          tier_0_workflow: [],
          tier_1_framing: ["AWS"],
          tier_1_5_skills_only: [],
          tier_2_banned: [],
        },
        skillSwaps: [],
        bulletProposals: [],
        candidateStats: new Map(),
        keywordWeights: new Map(),
        resume: masterResume,
        mode: "evidence",
      });
      assert.strictEqual(evidenceDiags.find((d) => d.keyword === "AWS")?.status, "needs_confirmation");
    });
  });

  describe("Phase 11: Study Ledger, Synthetic Marking & JSON/CSV Export", () => {
    it("records every injected claim (skills, bullet edits, new bullets) in the ledger, exports JSON/CSV with run metadata, and marks mutated resumes as synthetic", async () => {
      const {
        applyLarpMutationsToResume,
        exportLedgerToCsv,
        exportLedgerToJson,
        formatSyntheticResumeFilename,
        logLarpUserActionEvent,
        runLarpAlignmentPipeline,
      } = await import("../../larpEngine");

      const run = runLarpAlignmentPipeline(jds.pylon_fullstack.text, masterResume, {
        jdId: "pylon_fullstack",
      });

      assert.ok(run.ledger.length > 0);
      assert.strictEqual(run.runMetadata.jdId, "pylon_fullstack");
      assert.strictEqual(run.runMetadata.mode, "framing");
      assert.strictEqual(run.runMetadata.synthetic, true);

      const expectedSkillCount = run.skillSwaps.flatMap((s) => s.added).length;
      const expectedBulletEditCount = run.bulletProposals.length;
      const expectedNewBulletCount = run.malleableBullets.length;

      assert.strictEqual(
        run.ledger.filter((e) => e.kind === "skill_added").length,
        expectedSkillCount
      );
      assert.strictEqual(
        run.ledger.filter((e) => e.kind === "bullet_edit").length,
        expectedBulletEditCount
      );
      assert.strictEqual(
        run.ledger.filter((e) => e.kind === "new_bullet").length,
        expectedNewBulletCount
      );

      // Log a user action event and verify JSON & CSV export
      logLarpUserActionEvent({
        action: "accept",
        targetKind: "bullet_edit",
        targetId: run.bulletProposals[0].bulletId,
        keyword: run.bulletProposals[0].injectedKeywords[0],
        jdId: "pylon_fullstack",
      });

      const jsonStr = exportLedgerToJson(run.ledger, run.runMetadata);
      const parsedJson = JSON.parse(jsonStr);
      assert.strictEqual(parsedJson.synthetic, true);
      assert.strictEqual(parsedJson.metadata.jdId, "pylon_fullstack");
      assert.strictEqual(parsedJson.ledgerCount, run.ledger.length);
      assert.ok(parsedJson.userEvents.length >= 1);

      const csvStr = exportLedgerToCsv(run.ledger, run.runMetadata);
      const csvLines = csvStr.trim().split("\n");
      assert.strictEqual(csvLines.length, run.ledger.length + 1);
      assert.ok(csvLines[0].includes("jdId,mode,model,promptVersion,timestamp,synthetic,kind"));

      // Verify applyLarpMutationsToResume marks the resume as synthetic
      const acceptedBullets = new Set(run.bulletProposals.map((p) => p.bulletId));
      const mutatedResume = applyLarpMutationsToResume(masterResume, run, acceptedBullets, true);
      assert.strictEqual(mutatedResume.isSynthetic, true);
      assert.strictEqual(mutatedResume.syntheticMetadata?.jdId, "pylon_fullstack");
      assert.strictEqual(
        formatSyntheticResumeFilename("Lakshman_Resume.pdf"),
        "Lakshman_Resume_SYNTHETIC_LARP"
      );
    });
  });

  describe("Phase 12: Real Font-Metric Line Measurement & PDF Render Calibration Audit", () => {
    it("measures text with AFM Helvetica glyph widths (scaled to 108 units/line), removes filler-clause orphan padding, and validates line counts against the PDF renderer", async () => {
      const {
        createFontMetricMeasurer,
        fitBulletToCalibratedLineArea,
        heuristicMeasurer,
        measureMarkupWithMeasurer,
        verifyPdfRenderLineCounts,
      } = await import("../../larpEngine");

      const fontMeasurer = createFontMetricMeasurer(undefined, 108.0);
      const narrowWidth = fontMeasurer.width("iiiiiiiiii", false);
      const wideWidth = fontMeasurer.width("WWWWWWWWWW", false);
      const boldWidth = fontMeasurer.width("PostgreSQL", true);
      const regWidth = fontMeasurer.width("PostgreSQL", false);

      assert.ok(narrowWidth < wideWidth, "Real font metrics distinguish narrow 'i' from wide 'W'");
      assert.ok(boldWidth > regWidth, "Real font metrics account for bold glyph widths");
      assert.ok(heuristicMeasurer.width("test", false) > 0, "Heuristic measurer remains available as fallback");

      const sampleBullet =
        "Built **REST APIs**, **Redis** cache, and **PostgreSQL** schemas standardizing records across **5** services.";
      const measuredUnits = measureMarkupWithMeasurer(sampleBullet, fontMeasurer);
      assert.ok(
        measuredUnits > 60 && measuredUnits <= 108,
        `1-line bullet should measure <= 108 units (got ${measuredUnits})`
      );

      // Verify filler-clause orphan fix ("for low-latency data access...") is removed
      const orphanBullet =
        "Developed **REST APIs** and relational **PostgreSQL** schemas to standardize eligibility records across **5** internal services.";
      const fitted = fitBulletToCalibratedLineArea(orphanBullet);
      assert.ok(
        !fitted.includes("for low-latency data access"),
        "Generic filler-clause orphan padding must not be appended"
      );

      // Run the PDF render check across the master resume and verify line count agreement
      const audit = verifyPdfRenderLineCounts(masterResume);
      assert.strictEqual(audit.totalBullets, 9);
      assert.strictEqual(
        audit.calibrationValid,
        true,
        `PDF render line counts should match predicted line counts (discrepancies: ${JSON.stringify(
          audit.discrepancies
        )})`
      );
    });
  });

  describe("Phase 13: Focused JD Recommendations (1-2 Malleable Cards) & Global Default Picks", () => {
    it("emits strictly 1-2 JD-relevant malleable cards with <= 2 JD Match options plus saved company Default Pick", () => {
      const customDefault =
        "Built automated **PostgreSQL** migration checks and smoke tests for customer deployments.";
      const run = runLarpAlignmentPipeline(jds.pylon_fullstack.text, masterResume, {
        focusedRecommendations: true,
        defaultPicksByCompanyKey: {
          allyvoiceai: customDefault,
        },
      });

      assert.strictEqual(run.runMetadata.promptVersion, "align-v2.3-focused-missing-tech");
      assert.ok(
        run.malleableBullets.length >= 1 && run.malleableBullets.length <= 2,
        `Focused mode must return 1 or 2 cards (got ${run.malleableBullets.length})`
      );

      // Should NOT surface unrelated C++ robotics project on a full-stack SaaS web JD
      assert.ok(
        !run.malleableBullets.some((m) => m.targetContainerId === "proj_wato"),
        "Unrelated C++ rover project must be excluded from Full-Stack web JD recommendations"
      );

      // Full-Stack JD should prioritize the backend/frontend web role (Ally Voice AI)
      const allyCard = run.malleableBullets.find(
        (m) => m.targetContainerId === "job_ally"
      );
      assert.ok(allyCard, "Full-stack web role should be included in top 1-2 recommendations");

      const jdMatchOpts = allyCard.options.filter(
        (o) => !o.isDefaultPick && o.source !== "default"
      );
      const defaultOpts = allyCard.options.filter(
        (o) => o.isDefaultPick || o.source === "default"
      );

      assert.ok(
        jdMatchOpts.length >= 1 && jdMatchOpts.length <= 2,
        `Each focused card must offer 1 or 2 JD Match options (got ${jdMatchOpts.length})`
      );
      assert.strictEqual(defaultOpts.length, 1, "Should include saved Default Pick option");
      assert.strictEqual(defaultOpts[0].styleLabel, "Default Pick");
      assert.ok(
        plainText(defaultOpts[0].markup).includes("migration checks"),
        "Saved custom Default Pick should propagate into synthesized card options"
      );

      // Focused bullet edits should filter out awkward 'deployed on Firebase Cloud Functions using Docker' suffix
      assert.ok(
        !run.bulletProposals.some((bp) =>
          /\bdeployed\s+on\b[\s\S]*\busing\s+\*\*docker\*\*/i.test(bp.mutatedMarkup)
        ),
        "Awkward generic suffix on Firebase deployment bullet should be filtered in focused mode"
      );

      assert.strictEqual(run.aiRecommendation?.verified, true);
    });

    it("injects Linux and Agile into bullets/malleable cards for C++/Linux/Agile JDs without unrelated +Python recommendations", () => {
      // Model resume where WATonomous is an Experience role and Linux is only in Technical Skills (0 Experience bullets mention Linux)
      const resumeWithWatoInExp: MasterResume = {
        ...structuredClone(masterResume),
        experience: [
          {
            id: "job_wato",
            title: "Autonomy Engineer – Perception & Navigation Team",
            company: "WATonomous",
            companyUrl: "",
            location: "Waterloo, ON",
            dates: "2025",
            tags: ["systems"],
            bullets: structuredClone(masterResume.projects[0].bullets),
          },
          ...structuredClone(masterResume.experience),
        ],
        projects: structuredClone(masterResume.projects.slice(1)),
      };

      const gdJd = `General Dynamics — Student, Software Developer
Minimum Qualifications:
- Strong proficiency in C++ and developing on Linux environments.
Preferred Qualifications:
- Familiarity with Agile development sprints.`;

      const run = runLarpAlignmentPipeline(gdJd, resumeWithWatoInExp, {
        focusedRecommendations: true,
      });

      assert.ok(
        run.tiers.tier_0_workflow.includes("Agile"),
        `Agile should be detected as missing workflow (got matched=${JSON.stringify(
          run.tiers.matched
        )}, tier0=${JSON.stringify(run.tiers.tier_0_workflow)})`
      );

      const injectedBulletKeywords = run.bulletProposals.flatMap((bp) => bp.injectedKeywords);
      assert.ok(
        injectedBulletKeywords.includes("Linux"),
        `Linux should be injected into an Experience bullet when absent from Experience bullets (got ${JSON.stringify(
          injectedBulletKeywords
        )})`
      );
      assert.ok(
        injectedBulletKeywords.includes("Agile"),
        `Agile should be injected into a bullet (got ${JSON.stringify(injectedBulletKeywords)})`
      );

      const malleableText = run.malleableBullets
        .flatMap((mb) => [mb.markup, ...mb.options.filter((o) => !o.isDefaultPick).map((o) => o.markup)])
        .join(" \n ");
      assert.ok(
        containsPhrase(malleableText, "Linux"),
        `Malleable 1-Line Bullets should recommend Linux (got: ${malleableText})`
      );
      assert.strictEqual(
        containsPhrase(malleableText, "Python"),
        false,
        `Malleable bullets must NOT recommend unrelated Python when JD only asks for C++/Linux/Agile (got: ${malleableText})`
      );

      assert.strictEqual(run.aiRecommendation?.verified, true);
      assert.ok(
        (run.coverage?.afterPercent ?? 0) > (run.coverage?.beforePercent ?? 0),
        `Coverage should improve from ${run.coverage?.beforePercent}% -> ${run.coverage?.afterPercent}%`
      );
    });

    it("detects and injects missing TECH_DICTIONARY technologies (CMake, Bash, Unit Testing, Microservices, GCP)", () => {
      const richJd = `Platform Software Engineer
Required Qualifications:
- Experience writing C++ with CMake and Bash automation on Linux.
- Building backend Microservices with Python and deploying workloads on GCP.
- Writing automated Unit Testing suites.`;

      const run = runLarpAlignmentPipeline(richJd, masterResume, {
        focusedRecommendations: true,
      });

      for (const expectedTech of ["CMake", "Bash", "Unit Testing", "Microservices", "GCP"]) {
        assert.ok(
          run.tiers.tier_1_framing.includes(expectedTech),
          `Missing TECH_DICTIONARY term ${expectedTech} should be promoted into tier_1_framing`
        );
      }

      const injectedAll = new Set([
        ...run.skillSwaps.flatMap((s) => s.added),
        ...run.bulletProposals.flatMap((bp) => bp.injectedKeywords),
        ...run.malleableBullets.flatMap((mb) => mb.injectedKeywords),
      ]);
      assert.ok(
        run.bulletProposals.length >= 2,
        `Expected >= 2 missing TECH_DICTIONARY bullet injections, got ${run.bulletProposals.length}`
      );
      assert.ok(injectedAll.has("CMake") || injectedAll.has("Bash") || injectedAll.has("Microservices") || injectedAll.has("GCP"));
      assert.strictEqual(run.aiRecommendation?.verified, true);
    });
  });

  describe("Phase 14: Role-Context LLM Bullet Rewriting & Strict Ecosystem Coherence", () => {
    it("blocks cross-ecosystem language/framework mismatches (e.g. Java or Jest on a Python bullet, FastAPI on a TypeScript bullet)", async () => {
      const { checkEcosystemCompatibility, checkSlotPlausibility } = await import(
        "../../larpEngine"
      );

      const pythonBullet =
        "Built **Python** and **FastAPI** inference endpoints processing **120** requests/sec.";
      const pythonSlot = {
        bullet: {
          id: "b_py_api",
          text: pythonBullet,
          tools: ["Python", "FastAPI"],
          metrics: ["120"],
        },
        context: "backend-api-db" as const,
        tags: ["backend" as const],
        containerStack: ["Python", "FastAPI", "PostgreSQL"],
      };

      assert.strictEqual(
        checkEcosystemCompatibility(pythonBullet, ["Python", "FastAPI"], ["Python", "FastAPI"], "Java"),
        false,
        "Python bullet must never accept Java"
      );
      assert.strictEqual(
        checkEcosystemCompatibility(pythonBullet, ["Python", "FastAPI"], ["Python", "FastAPI"], "Jest"),
        false,
        "Python bullet must never accept Jest (JS/TS testing framework)"
      );
      assert.strictEqual(
        checkSlotPlausibility(pythonSlot, "Jest", true).ok,
        false,
        "checkSlotPlausibility must reject Jest on a Python/FastAPI slot"
      );
      assert.strictEqual(
        checkSlotPlausibility(pythonSlot, "Node.js", true).ok,
        false,
        "checkSlotPlausibility must reject Node.js on a Python/FastAPI slot"
      );
      assert.strictEqual(
        checkSlotPlausibility(pythonSlot, "Unit Testing", true).ok,
        true,
        "checkSlotPlausibility must allow language-agnostic Unit Testing on a Python/FastAPI slot"
      );

      const tsBullet =
        "Developed **TypeScript** and **Next.js** dashboard views serving **40** enterprise clients.";
      assert.strictEqual(
        checkEcosystemCompatibility(tsBullet, ["TypeScript", "Next.js"], ["TypeScript", "Next.js", "React"], "FastAPI"),
        false,
        "TypeScript/Next.js bullet must never accept Python FastAPI"
      );
      assert.strictEqual(
        checkEcosystemCompatibility(tsBullet, ["TypeScript", "Next.js"], ["TypeScript", "Next.js", "React"], "Jest"),
        true,
        "TypeScript/Next.js bullet should accept Jest"
      );
    });

    it("provides the LLM with every bullet done in the role/project, compatible available items, and ecosystem exclusions, and prioritizes LLM rewrites over generic rules", async () => {
      const {
        clearLlmRewriteCache,
        runLarpAlignmentPipelineAsync,
      } = await import("../../larpEngine");
      clearLlmRewriteCache();

      const capturedPrompts: string[] = [];
      const mockLlm = async (p: { system: string; user: string }): Promise<string> => {
        capturedPrompts.push(p.user);
        return JSON.stringify({
          rewrites: [
            "Built **FastAPI** webhook routes and **Redis** session cache handling **500+** daily calls.",
          ],
        });
      };

      const roleResume: MasterResume = {
        ...structuredClone(masterResume),
        experience: [
          {
            id: "job_py_role",
            title: "Backend Software Engineer",
            company: "VoiceFlow AI",
            companyUrl: "",
            location: "Waterloo, ON",
            dates: "2026",
            tags: ["backend"],
            bullets: [
              {
                id: "b_role_1",
                text: "Built **FastAPI** webhook routes handling **500+** daily calls.",
                tools: ["FastAPI", "Python"],
                metrics: ["500+"],
              },
              {
                id: "b_role_2",
                text: "Designed **PostgreSQL** schemas and **Python** worker queues for call transcripts.",
                tools: ["PostgreSQL", "Python"],
                metrics: [],
              },
              {
                id: "b_role_3",
                text: "Automated **Docker** container builds and health checks across staging hosts.",
                tools: ["Docker"],
                metrics: [],
              },
            ],
          },
        ],
        projects: [],
      };

      const run = await runLarpAlignmentPipelineAsync(
        "Required Qualifications:\n- Experience with Python, FastAPI, PostgreSQL, and Redis caching.",
        roleResume,
        {
          llm: mockLlm,
          focusedRecommendations: true,
        }
      );

      assert.ok(capturedPrompts.length > 0, "LLM proposer must be invoked even when catalog rules exist");
      const firstPrompt = capturedPrompts[0];
      assert.ok(
        firstPrompt.includes("Built **FastAPI** webhook routes") &&
          firstPrompt.includes("Designed **PostgreSQL** schemas") &&
          firstPrompt.includes("Automated **Docker** container builds"),
        "Prompt must include ALL bullets from the role so the LLM sees everything done in that role"
      );
      assert.ok(
        firstPrompt.includes("Java") && firstPrompt.includes("Jest"),
        "Forbidden list for a Python/FastAPI bullet must explicitly exclude Java and Jest"
      );

      const redisProp = run.bulletProposals.find((bp) =>
        bp.injectedKeywords.includes("Redis")
      );
      assert.ok(redisProp, "Redis proposal should be selected");
      assert.strictEqual(
        redisProp.source,
        "llm",
        "Guardrail-verified role-contextual LLM rewrite should win over generic regex rules"
      );
    });
  });
});
