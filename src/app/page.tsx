"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  GitBranch,
  ShieldCheck,
  Sliders,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const AGENT_EXECUTION_PROMPT = `You are operating the HireMe Agents Queue (/agents) to submit job applications deterministically.

For each entry inside the "Active Queue" section that shows status "Not Sent":
1. Download the locked PDF by clicking the monospace filename button (e.g., First_Last_Role.pdf). Wait for the download to finish.
2. Open the adjacent external job posting URL in a new tab.
3. Complete the application form faithfully using the candidate data inside that downloaded PDF:
   - Upload the downloaded PDF directly (do NOT edit or reformat it).
   - Fill work authorization, education, links, and required questions truthfully.
   - If the portal pauses for manual review, captcha, or login, ask the user before proceeding.
4. Once the confirmation screen renders, return to /agents and toggle the "Sent to Company" switch (role="switch") on that exact row.
5. Click the now-enabled "Archive" button to move the completed entry into Archive and proceed to the next queued role.`;

function PipelineSchematicFigure() {
  const stages = [
    {
      step: "01",
      route: "/experience",
      title: "Master Resume",
      model: "MasterResume",
      summary: "Single source of truth imported via Universal LaTeX Parser or edited live with real-time line calibration.",
      icon: Sparkles,
    },
    {
      step: "02",
      route: "/operations",
      title: "Precision Alignment",
      model: "Hungarian O(n³)",
      summary: "Extracts 4-tier JD terms, synthesizes collapsible 1-line bullets, and pairs edits via global bipartite matching.",
      icon: Sliders,
    },
    {
      step: "03",
      route: "/preview",
      title: "Slot Customizer & PDF",
      model: "PreviewQueueItem",
      summary: "Per-application isolated clones with fine editor parity, 1-line phrasing picks, and in-browser vector PDF render.",
      icon: Eye,
    },
    {
      step: "04",
      route: "/agents",
      title: "Agents Execution Queue",
      model: "AgentResumeEntry",
      summary: "Frozen single-page PDF triggers paired with external role URLs, Sent switches, and gated archival states.",
      icon: Bot,
    },
  ];

  return (
    <figure className="my-8 bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#ebebeb] bg-[#fafafa] flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
          Figure 01 · End-to-End Pipeline &amp; Data Isolation Schematic
        </span>
        <span className="font-mono text-[10px] text-neutral-400">
          Human Editorial Loop → Autonomous Execution
        </span>
      </div>

      {/* Responsive SVG Architecture Diagram */}
      <div className="p-5 sm:p-6 border-b border-[#ebebeb] overflow-x-auto">
        <svg
          viewBox="0 0 720 198"
          className="w-full min-w-[560px] h-auto select-none"
          role="img"
          aria-label="HireMe four-stage pipeline diagram connecting Experience, Operations, Preview, Agents Queue, Firebase RTDB, and Autonomous Browser Agent"
        >
          <defs>
            <marker
              id="arrow-neutral"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#737373" />
            </marker>
            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#10b981" />
            </marker>
          </defs>

          {/* Subtle Boundary Boxes */}
          <rect
            x="8"
            y="10"
            width="528"
            height="108"
            rx="10"
            fill="#fafafa"
            stroke="#ebebeb"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <text x="18" y="26" fontSize="9" fontFamily="ui-monospace, monospace" fill="#737373">
            CALIBRATION &amp; APPROVAL WORKSPACE (HUMAN-IN-THE-LOOP)
          </text>

          <rect
            x="550"
            y="10"
            width="162"
            height="108"
            rx="10"
            fill="#10b9810d"
            stroke="#10b98140"
            strokeWidth="1"
          />
          <text x="560" y="26" fontSize="9" fontFamily="ui-monospace, monospace" fill="#047857">
            EXECUTION HANDOFF
          </text>

          {/* Nodes 1 to 4 + Agent */}
          {[
            { x: 18, label: "01 Experience", sub: "MasterResume", tone: "#ffffff", stroke: "#ebebeb" },
            { x: 150, label: "02 Operations", sub: "Hungarian Match", tone: "#ffffff", stroke: "#ebebeb" },
            { x: 282, label: "03 Preview", sub: "Slot Isolation", tone: "#ffffff", stroke: "#ebebeb" },
            { x: 414, label: "04 /agents", sub: "Locked PDFs", tone: "#171717", stroke: "#171717", dark: true },
          ].map((node, idx) => (
            <g key={node.label}>
              <rect
                x={node.x}
                y="40"
                width="110"
                height="62"
                rx="8"
                fill={node.tone}
                stroke={node.stroke}
                strokeWidth="1"
              />
              <text
                x={node.x + 12}
                y="65"
                fontSize="11"
                fontWeight="600"
                fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                fill={node.dark ? "#ffffff" : "#171717"}
              >
                {node.label}
              </text>
              <text
                x={node.x + 12}
                y="84"
                fontSize="9.5"
                fontFamily="ui-monospace, monospace"
                fill={node.dark ? "#a3a3a3" : "#737373"}
              >
                {node.sub}
              </text>
              {idx < 3 && (
                <line
                  x1={node.x + 112}
                  y1="71"
                  x2={node.x + 130}
                  y2="71"
                  stroke="#737373"
                  strokeWidth="1.25"
                  markerEnd="url(#arrow-neutral)"
                />
              )}
            </g>
          ))}

          {/* Arrow from /agents to Browser Agent */}
          <line
            x1="526"
            y1="71"
            x2="562"
            y2="71"
            stroke="#10b981"
            strokeWidth="1.5"
            markerEnd="url(#arrow-emerald)"
          />

          <rect
            x="565"
            y="40"
            width="136"
            height="62"
            rx="8"
            fill="#ffffff"
            stroke="#10b981"
            strokeWidth="1.2"
          />
          <circle cx="580" cy="61" r="3.5" fill="#10b981" />
          <text
            x="590"
            y="65"
            fontSize="11"
            fontWeight="600"
            fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
            fill="#171717"
          >
            Browser Agent
          </text>
          <text
            x="580"
            y="84"
            fontSize="9.5"
            fontFamily="ui-monospace, monospace"
            fill="#047857"
          >
            Portal Submit + Switch
          </text>

          {/* Bottom RTDB / Offline Queue Layer */}
          <rect
            x="18"
            y="138"
            width="683"
            height="48"
            rx="8"
            fill="#f5f5f5"
            stroke="#ebebeb"
            strokeWidth="1"
          />
          <text x="32" y="158" fontSize="9.5" fontWeight="600" fontFamily="ui-monospace, monospace" fill="#171717">
            OFFLINE-FIRST REALTIME DATABASE LAYER
          </text>
          <text x="32" y="174" fontSize="9" fontFamily="ui-monospace, monospace" fill="#737373">
            masterResumes/{"{uid}"}  ·  previewQueues/{"{uid}"}  ·  agentsQueues/{"{uid}"}  ·  appliedJobs/{"{pushId}"}
          </text>

          {/* Vertical Sync Connectors */}
          {[73, 337, 469, 633].map((cx, i) => (
            <line
              key={cx}
              x1={cx}
              y1="103"
              x2={cx}
              y2="136"
              stroke={i === 3 ? "#10b981" : "#a3a3a3"}
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          ))}
        </svg>
      </div>

      {/* 4 Stage Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#ebebeb]">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          return (
            <Link
              key={stage.step}
              href={stage.route}
              className={`group p-4 sm:p-5 bg-white hover:bg-[#fafafa] transition-colors flex flex-col justify-between gap-2 ${
                idx >= 2 ? "sm:border-t sm:border-[#ebebeb]" : ""
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400">{stage.step}</span>
                    <Icon className="w-3.5 h-3.5 text-neutral-700" />
                    <span className="text-xs font-semibold text-neutral-900">{stage.title}</span>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500 bg-neutral-100 border border-[#ebebeb] px-2 py-0.5 rounded-full">
                    {stage.model}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">{stage.summary}</p>
              </div>
              <div className="flex items-center gap-1 font-mono text-[10px] text-neutral-500 group-hover:text-neutral-900 pt-1">
                <span>{stage.route}</span>
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </figure>
  );
}

function TypographyCalibrationChart() {
  const zones = [
    {
      label: "1-Line Tight Green Zone",
      range: "88 – 108 AFM units (82%–100% of 1L)",
      status: "Accepted",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      barClass: "bg-emerald-500",
      widthPct: 45,
      sample:
        "Built idempotent PostgreSQL billing webhooks cutting duplicate invoice retries by 64% across 18M calls.",
      metricNote: "102 / 108 units · 1L exact",
    },
    {
      label: "2-Line Orphan Danger Zone",
      range: "109 – 158 AFM units (< 65% of Line 2)",
      status: "Rejected (line_growth)",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
      barClass: "bg-amber-500",
      widthPct: 65,
      sample:
        "Built idempotent PostgreSQL billing webhooks cutting duplicate invoice retries by 64% across 18M annual API requests.",
      metricNote: "118 units · 2-word orphan spillover",
    },
    {
      label: "2-Line Balanced Green Zone",
      range: "170 – 216 AFM units (65%–100% of 2L)",
      status: "Accepted",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      barClass: "bg-emerald-500",
      widthPct: 90,
      sample:
        "Built idempotent PostgreSQL and Redis billing webhooks with distributed locking, eliminating duplicate invoice retries by 64% across 18M high-throughput monthly partner requests.",
      metricNote: "184 / 216 units · 2L balanced",
    },
    {
      label: "Page-Break Overflow",
      range: "> 216 AFM units (3+ lines)",
      status: "Rejected (overflow)",
      badgeClass: "bg-red-50 text-red-700 border-red-200",
      barClass: "bg-red-500",
      widthPct: 100,
      sample:
        "Spills onto a third line, compounding vertically to push the final footer onto an unintended Page 2.",
      metricNote: "> 216 units · Hard guardrail block",
    },
  ];

  return (
    <figure className="my-8 bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#ebebeb] bg-[#fafafa] flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
          Chart 01 · Helvetica AFM Glyph-Width Calibration Zones
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          DEFAULT_CALIBRATION: oneLineMax = 108 · twoLineMax = 216
        </span>
      </div>

      {/* Horizontal Continuous Scale Bar */}
      <div className="p-5 sm:p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-[10px] text-neutral-400">
            <span>0 units</span>
            <span>88 (1L min)</span>
            <span className="text-neutral-700 font-semibold">108 (1L max)</span>
            <span>170 (2L min)</span>
            <span className="text-neutral-700 font-semibold">216 (2L max)</span>
            <span>240+</span>
          </div>
          <div className="h-3 w-full rounded-full overflow-hidden flex border border-[#ebebeb] bg-[#fafafa]">
            <div className="h-full bg-amber-200/70" style={{ width: "36.6%" }} title="Short 1-Line (< 82%)" />
            <div className="h-full bg-emerald-500" style={{ width: "8.4%" }} title="1-Line Tight Green Zone (88–108)" />
            <div className="h-full bg-amber-400" style={{ width: "25.8%" }} title="2-Line Orphan Zone (109–169)" />
            <div className="h-full bg-emerald-500" style={{ width: "19.2%" }} title="2-Line Balanced Green Zone (170–216)" />
            <div className="h-full bg-red-500" style={{ width: "10%" }} title="3-Line Overflow (> 216)" />
          </div>
        </div>

        {/* Zone Detail Bars & Visual Typographic Samples */}
        <div className="space-y-3">
          {zones.map((z) => (
            <div
              key={z.label}
              className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-neutral-900">{z.label}</span>
                  <span className="font-mono text-[10px] text-neutral-500">{z.range}</span>
                </div>
                <span
                  className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${z.badgeClass}`}
                >
                  {z.status}
                </span>
              </div>

              <div className="h-1.5 w-full bg-neutral-200/70 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${z.barClass}`} style={{ width: `${z.widthPct}%` }} />
              </div>

              <div className="flex items-start justify-between gap-3 pt-0.5 flex-col sm:flex-row">
                <p className="text-[11px] text-neutral-600 leading-snug max-w-xl">
                  &ldquo;{z.sample}&rdquo;
                </p>
                <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                  {z.metricNote}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function DefensibilityAndCoverageChart() {
  const coverageBars = [
    {
      label: "Unweighted JD Term Match",
      before: 44,
      after: 86,
      delta: "+42%",
    },
    {
      label: "Section-Weighted ATS Score",
      before: 41,
      after: 89,
      delta: "+48%",
    },
  ];

  const tiers = [
    {
      tier: "Tier 0",
      name: "Present in Inventory",
      policy: "Already verified in resume bullets or skills.",
      placement: "No mutation",
      dotClass: "bg-neutral-400",
    },
    {
      tier: "Tier 1",
      name: "Workflow & Framing",
      policy: "Plausibly grounded in existing engineering context.",
      placement: "<= 7 word bullet edit + Skills",
      dotClass: "bg-emerald-500",
    },
    {
      tier: "Tier 1.5",
      name: "Skills-Table Only",
      policy: "Adjacent framework candidate never fabricated inside bullets.",
      placement: "Skills section strictly",
      dotClass: "bg-cyan-500",
    },
    {
      tier: "Tier 2",
      name: "Hard-Banned",
      policy: "Low-level/specialized tools absent from resume (e.g. CUDA, C++).",
      placement: "Blocked across all outputs",
      dotClass: "bg-red-500",
    },
  ];

  const invariantChecks = [
    "Check 1 · Guardrail Re-Validation on All Edits",
    "Check 2 · Zero Tier-2 Banned Tech Leakage",
    "Check 3 · Zero Tier-1.5 Skills-Only Tech in Bullets",
    "Check 4 · Calibrated Line-Fit & Zero Overflow",
    "Check 5 · Zero Duplicate Bullets",
    "Check 6 · JD Keyword Coverage Progression",
  ];

  return (
    <figure className="my-8 bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#ebebeb] bg-[#fafafa] flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
          Chart 02 · Coverage Lift (Illustrative Run) &amp; 4-Tier Defensibility Gates
        </span>
        <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          6/6 Verification Invariants
        </span>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Coverage Before vs After Chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coverageBars.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-neutral-900">{metric.label}</span>
                <span className="font-mono text-[11px] font-semibold text-emerald-700">
                  {metric.delta} lift
                </span>
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between font-mono text-[10px] text-neutral-500">
                    <span>Master Resume Baseline</span>
                    <span>{metric.before}%</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-neutral-400 rounded-full"
                      style={{ width: `${metric.before}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between font-mono text-[10px] text-neutral-900 font-medium">
                    <span>After Hungarian Alignment</span>
                    <span>{metric.after}%</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${metric.after}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 4-Tier Classification Table */}
        <div className="rounded-lg border border-[#ebebeb] overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-[#ebebeb] bg-[#fafafa] font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 px-3.5 font-semibold">Tier</th>
                <th className="py-2.5 px-3.5 font-semibold">Classification</th>
                <th className="py-2.5 px-3.5 font-semibold">Defensibility Gate</th>
                <th className="py-2.5 px-3.5 font-semibold">Allowed Placement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebebeb] text-xs">
              {tiers.map((row) => (
                <tr key={row.tier} className="bg-white">
                  <td className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-neutral-900 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${row.dotClass}`} />
                      <span>{row.tier}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 font-medium text-neutral-800 whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="py-2.5 px-3.5 text-neutral-600">{row.policy}</td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-neutral-700 whitespace-nowrap">
                    {row.placement}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 6 Verification Passes Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {invariantChecks.map((check) => (
            <div
              key={check}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#fafafa] border border-[#ebebeb] font-mono text-[11px] text-neutral-700"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{check}</span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function AgentHandoffFigure() {
  const steps = [
    {
      num: "01",
      title: "Click filename button",
      detail: "Triggers on-demand vector PDF compilation from the frozen entry.tailoredResume snapshot.",
    },
    {
      num: "02",
      title: "Follow target roleUrl",
      detail: "Opens the company ATS portal. The agent uploads the deterministic PDF and completes portal fields.",
    },
    {
      num: "03",
      title: "Flip Sent to Company",
      detail: 'Toggles the ARIA role="switch" state, persisting sentAt locally and logging the job to RTDB appliedJobs.',
    },
    {
      num: "04",
      title: "Click Archive gate",
      detail: "Unlocked exclusively when sentToCompany === true, preventing accidental dismissal of unsubmitted roles.",
    },
  ];

  return (
    <figure className="my-8 bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#ebebeb] bg-[#fafafa] flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
          Figure 02 · Annotated /agents Queue Contract &amp; State Machine
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          DOM-Deterministic Primitives
        </span>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Annotated Mock Row matching src/app/agents/page.tsx */}
        <div className="rounded-xl border border-[#ebebeb] bg-[#fafafa] p-4 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
            Active Queue Row Anatomy (/agents)
          </div>

          <div className="bg-white rounded-xl border border-[#ebebeb] shadow-2xs p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-semibold text-neutral-900">
                  Stripe — Backend Infrastructure Engineer
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-0.5 rounded-full border bg-neutral-100 text-neutral-600 border-[#ebebeb]">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                  <span>Not Sent</span>
                </span>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-900 bg-[#fafafa] border border-neutral-300 px-2.5 py-1 rounded-md">
                  <span className="font-semibold text-emerald-700">[01]</span>
                  <Download className="w-3 h-3 text-neutral-600" />
                  <span className="underline decoration-neutral-300 underline-offset-2">
                    Candidate_Stripe_Backend_Infra.pdf
                  </span>
                </span>

                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-600">
                  <span className="font-semibold text-emerald-700">[02]</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="underline decoration-[#ebebeb] underline-offset-2">
                    https://stripe.com/jobs/...
                  </span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border bg-white text-neutral-700 border-neutral-300">
                <span className="font-mono text-[10px] font-semibold text-emerald-700">[03]</span>
                <span className="relative inline-flex h-3.5 w-6 items-center rounded-full bg-neutral-300">
                  <span className="inline-block h-2.5 w-2.5 transform rounded-full bg-white translate-x-0.5" />
                </span>
                <span>Sent to Company</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border bg-[#fafafa] text-neutral-400 border-[#ebebeb]">
                <span className="font-mono text-[10px] font-semibold text-neutral-500">[04]</span>
                <span>Archive</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4 Step Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {steps.map((s) => (
            <div
              key={s.num}
              className="rounded-lg border border-[#ebebeb] bg-white p-3.5 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  {s.num}
                </span>
                <span className="text-xs font-semibold text-neutral-900">{s.title}</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">{s.detail}</p>
            </div>
          ))}
        </div>

        {/* SVG State Machine Transition Diagram */}
        <div className="rounded-lg border border-[#ebebeb] bg-[#fafafa] p-4 overflow-x-auto">
          <svg
            viewBox="0 0 680 76"
            className="w-full min-w-[500px] h-auto select-none"
            role="img"
            aria-label="Agent application submission state machine: Not Sent -> PDF Export -> Role Submitted -> Sent Switch -> Archive"
          >
            <defs>
              <marker
                id="sm-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="#525252" />
              </marker>
            </defs>

            {[
              { x: 6, w: 122, title: "Active · Not Sent", sub: "archived: false", fill: "#ffffff", stroke: "#ebebeb" },
              { x: 150, w: 118, title: "PDF Compiled", sub: "vector Blob", fill: "#ffffff", stroke: "#ebebeb" },
              { x: 290, w: 118, title: "Portal Submitted", sub: "external ATS", fill: "#ffffff", stroke: "#ebebeb" },
              { x: 430, w: 116, title: "Sent to Company", sub: "logs appliedJobs", fill: "#ecfdf5", stroke: "#a7f3d0" },
              { x: 568, w: 106, title: "Archived", sub: "gate unlocked", fill: "#171717", stroke: "#171717", dark: true },
            ].map((state, idx, arr) => (
              <g key={state.title}>
                <rect
                  x={state.x}
                  y="14"
                  width={state.w}
                  height="46"
                  rx="8"
                  fill={state.fill}
                  stroke={state.stroke}
                  strokeWidth="1"
                />
                <text
                  x={state.x + state.w / 2}
                  y="34"
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="600"
                  fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                  fill={state.dark ? "#ffffff" : "#171717"}
                >
                  {state.title}
                </text>
                <text
                  x={state.x + state.w / 2}
                  y="49"
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                  fill={state.dark ? "#a3a3a3" : "#737373"}
                >
                  {state.sub}
                </text>
                {idx < arr.length - 1 && (
                  <line
                    x1={state.x + state.w + 3}
                    y1="37"
                    x2={arr[idx + 1].x - 3}
                    y2="37"
                    stroke="#525252"
                    strokeWidth="1.25"
                    markerEnd="url(#sm-arrow)"
                  />
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </figure>
  );
}

function AgentPromptBlock() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_EXECUTION_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-6 bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
      <div className="px-4 py-3 border-b border-[#ebebeb] bg-[#fafafa] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-neutral-700" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-600 font-semibold">
            Agent Execution Runbook Prompt
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-[#ebebeb] rounded-full shadow-2xs active:scale-95 transition-all duration-150 cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-600" />
              <span className="text-emerald-700">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-neutral-500" />
              <span>Copy Prompt</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 sm:p-5 font-mono text-[11px] sm:text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap overflow-x-auto bg-white">
        {AGENT_EXECUTION_PROMPT}
      </pre>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  return (
    <article className="flex-1 w-full max-w-3xl mx-auto py-10 sm:py-16 space-y-14 pb-24 sm:pb-16 animate-fadeIn">
      {/* Editorial Article Header */}
      <header className="space-y-6 border-b border-[#ebebeb] pb-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            SYSTEM NOTE 01 · ARCHITECTURE &amp; AUTONOMOUS AGENT WORKFLOW
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-white text-neutral-700 border border-[#ebebeb] shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Active Development</span>
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-neutral-900 leading-[1.12]">
          Precision resume engineering, built to be executed by agents.
        </h1>

        <p className="text-sm sm:text-base text-neutral-600 leading-relaxed max-w-2xl">
          Most job-application automation fails at the same boundary: agents are asked to tailor a
          resume on the fly while filling forms, producing hallucinated skills, broken line wraps,
          and accidental two-page overflows.{" "}
          <span className="text-neutral-900 font-medium">hireme</span> separates editorial calibration
          from mechanical submission so autonomous browser agents receive locked, single-page vector
          artifacts ready for upload.
        </p>

        <div className="flex items-center gap-2.5 flex-wrap pt-1">
          <Link
            href={user ? "/experience" : "/login"}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-full shadow-subtle hover:shadow-subtle-hover active:scale-95 transition-all duration-150"
          >
            <span>{user ? "Open Workspace" : "Get Started"}</span>
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2]" />
          </Link>

          <Link
            href={user ? "/agents" : "/login?redirect=/agents"}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border border-[#ebebeb] text-xs font-medium rounded-full shadow-2xs active:scale-95 transition-all duration-150"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>View Agents Queue</span>
          </Link>

          <a
            href="https://github.com/LaxExe/HireMe"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 border border-[#ebebeb] text-xs font-medium rounded-full shadow-2xs active:scale-95 transition-all duration-150"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>LaxExe/HireMe</span>
            <ExternalLink className="w-3 h-3 text-neutral-400" />
          </a>
        </div>
      </header>

      {/* Section 01: The Four-Stage Pipeline */}
      <section className="space-y-4">
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            01 · Pipeline Architecture
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Four decoupled workspaces, from master source to agent queue
          </h2>
        </div>

        <p className="text-sm text-neutral-600 leading-relaxed">
          Instead of mutating one shared document, HireMe routes every target job posting through
          four strictly typed stages. Each stage writes into isolated collections in Firebase
          Realtime Database backed by immediate <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">localStorage</code> hydration:
        </p>

        <ul className="space-y-2.5 text-sm text-neutral-600 leading-relaxed pl-1">
          <li className="flex items-start gap-2.5">
            <span className="font-mono text-xs font-semibold text-neutral-900 mt-0.5">01</span>
            <span>
              <strong className="text-neutral-900 font-semibold">/experience</strong> stores your
              canonical <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">MasterResume</code>, imported via the
              Universal LaTeX Parser or structured inline while maintaining domain context tags and numeric metrics.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="font-mono text-xs font-semibold text-neutral-900 mt-0.5">02</span>
            <span>
              <strong className="text-neutral-900 font-semibold">/operations</strong> ingests a
              job description, classifies target keywords across four defensibility tiers, and solves
              an <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">O(n³)</code> Hungarian bipartite assignment so each bullet accepts at most one clean edit.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="font-mono text-xs font-semibold text-neutral-900 mt-0.5">03</span>
            <span>
              <strong className="text-neutral-900 font-semibold">/preview</strong> clones the master
              resume into per-application <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">PreviewQueueItem</code> slots. Fine edits made in Customize Resume stay isolated to that job while rendering a live vector PDF side-by-side.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="font-mono text-xs font-semibold text-neutral-900 mt-0.5">04</span>
            <span>
              <strong className="text-neutral-900 font-semibold">/agents</strong> freezes approved
              tailored snapshots into <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">AgentResumeEntry</code> rows engineered specifically for reliable browser-agent consumption.
            </span>
          </li>
        </ul>

        <PipelineSchematicFigure />
      </section>

      {/* Section 02: Typographic Calibration */}
      <section className="space-y-4 border-t border-[#ebebeb] pt-10">
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            02 · Typographic Calibration
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Measuring Helvetica glyphs before a single line wraps
          </h2>
        </div>

        <p className="text-sm text-neutral-600 leading-relaxed">
          Blind word-count limits fail because three uppercase acronyms occupy far more horizontal
          ink than three lowercase prepositions. Both the calibration bar in{" "}
          <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">/experience</code> and
          the rewrite verifier read per-character Adobe Font Metrics (AFM) widths scaled to{" "}
          <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">108.0</code> units per printable
          line (<code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">DEFAULT_CALIBRATION</code>).
        </p>

        <p className="text-sm text-neutral-600 leading-relaxed">
          If reframing a 1-line achievement pushes it across <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">108</code> units
          without reaching at least <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">65%</code> fill
          on the second line, <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">validateRewrite</code> rejects
          the proposal as an orphan spillover. What renders cleanly in Preview stays locked onto
          one crisp vector page via <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">pdf-lib</code>.
        </p>

        <TypographyCalibrationChart />
      </section>

      {/* Section 03: Defensibility & Global Matching */}
      <section className="space-y-4 border-t border-[#ebebeb] pt-10">
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            03 · Defensibility &amp; Matching
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Four-tier guardrails and Hungarian bipartite optimization
          </h2>
        </div>

        <p className="text-sm text-neutral-600 leading-relaxed">
          Keyword alignment only works if you can defend every phrase in a technical interview.
          Before proposing changes, HireMe partitions extracted JD requirements into four strict
          tiers. Unfamiliar hard systems technologies are locked out completely (Tier 2), while
          adjacent tools stay confined to the Skills block (Tier 1.5).
        </p>

        <p className="text-sm text-neutral-600 leading-relaxed">
          Eligible workflow terms compete in a global bipartite matrix rather than greedy first-match
          loops. Every bullet edit is hard-capped at <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">&lt;= 7</code> changed
          words and must preserve 100% of original numbers and latency/scale metrics. When an
          optional role-specific point is needed, collapsible 1-line malleable cards let you swap
          between domain phrasings in one click before all 6 automated invariants execute.
        </p>

        <DefensibilityAndCoverageChart />
      </section>

      {/* Section 04: How to Run With an Autonomous Agent */}
      <section className="space-y-4 border-t border-[#ebebeb] pt-10">
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            04 · Autonomous Agent Workflow
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            How HireMe is designed to be handed off to an agent
          </h2>
        </div>

        <p className="text-sm text-neutral-600 leading-relaxed">
          In the browser-agent paradigm, you curate and approve resumes in{" "}
          <strong className="text-neutral-900 font-semibold">/operations</strong> and{" "}
          <strong className="text-neutral-900 font-semibold">/preview</strong>, then batch-push the
          finished roles to <strong className="text-neutral-900 font-semibold">/agents</strong>.
          Once queued, an autonomous agent (Antigravity Browser Subagent, Computer Use, or Playwright)
          only needs access to that single page to drive submissions end-to-end.
        </p>

        <p className="text-sm text-neutral-600 leading-relaxed">
          Every row in <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">/agents</code> exposes
          predictable semantic hooks: a deterministic filename download button, the external posting
          anchor, an ARIA <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">role=&quot;switch&quot;</code> button
          that records submissions directly to <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">appliedJobs</code>,
          and an <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">Archive</code> button that remains
          disabled until the application is confirmed sent.
        </p>

        <AgentHandoffFigure />

        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Drop-in prompt for your browser agent</span>
          </h3>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Point an authenticated browser agent at <code className="font-mono text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">/agents</code> with the runbook below:
          </p>
          <AgentPromptBlock />
        </div>
      </section>

      {/* Section 05: Offline-First Persistence & Closing CTA */}
      <section className="space-y-6 border-t border-[#ebebeb] pt-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
              05 · Offline-First Persistence
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900">
            Resilient local queuing with automatic Firebase synchronization
          </h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Every edit across <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">/experience</code>,{" "}
            <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">/preview</code>, and{" "}
            <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">/agents</code> renders
            optimistically from in-memory and <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">localStorage</code> stores.
            When network connectivity drops, pending writes buffer inside{" "}
            <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">hireme_offline_sync_queue</code> and
            automatically flush to Firebase Realtime Database the moment <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">online</code> or{" "}
            <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded border border-[#ebebeb]">focus</code> fires.
          </p>
        </div>

        {/* Closing Navigation Card */}
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900">
              Ready to calibrate your master resume?
            </h3>
            <p className="text-xs text-neutral-500">
              Start in Experience, run alignment in Operations, verify layout in Preview, and queue for Agents.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href={user ? "/experience" : "/login"}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-full shadow-2xs active:scale-95 transition-all duration-150"
            >
              <span>{user ? "Go to Experience" : "Sign in to Start"}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href={user ? "/operations" : "/login?redirect=/operations"}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-[#ebebeb] text-xs font-medium rounded-full shadow-2xs active:scale-95 transition-all duration-150"
            >
              <span>Operations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
