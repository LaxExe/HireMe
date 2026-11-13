import type { Bullet, CalibrationConfig } from "./types";
import { DEFAULT_CALIBRATION } from "./types";

export const uid = (prefix = "n") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function dedupeCI(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Split on separator characters that are not nested inside brackets. */
function splitTop(input: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.includes(ch)) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function maskParens(s: string): string {
  let depth = 0;
  let out = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    out += depth > 0 && ch === "/" ? "\u0001" : ch;
  }
  return out;
}

// Slash separates tools ("C++/C"), except well-known compounds such as CI/CD.
const SLASH_SPLIT = /\s*(?<!CI|TCP|\bI|\bA)\/(?!CD|IP|O\b|B\b)\s*/;
const AND_SPLIT = /\s+and\s+/;

/** Break a list like "C++/C, Python, GitHub Actions (CI/CD)" into atomic items. */
export function splitItems(input: string, splitAnd = false): string[] {
  const out: string[] = [];
  for (const part of splitTop(maskParens(input), ",")) {
    const pieces = part
      .split(SLASH_SPLIT)
      .flatMap((p) => (splitAnd ? p.split(AND_SPLIT) : [p]));
    for (const p of pieces) out.push(p.replace(/\u0001/g, "/").trim());
  }
  return dedupeCI(out);
}

export interface Segment {
  text: string;
  bold: boolean;
}

export function parseMarkup(markup: string): Segment[] {
  return markup
    .split("**")
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((s) => s.text.length > 0);
}

export const plainText = (markup: string) => markup.replace(/\*\*/g, "");

const isMetric = (s: string) =>
  /^[~≈<>]?\s*(over\s+|under\s+|about\s+)?\d/i.test(s) || /%\+?$/.test(s);

/** Derive the tools and metrics referenced by a bullet. */
export function analyzeBullet(
  markup: string,
  known: string[]
): { tools: string[]; metrics: string[] } {
  const segments = parseMarkup(markup);
  const tools: string[] = [];
  const metrics: string[] = [];

  for (const seg of segments) {
    if (!seg.bold) continue;
    const t = seg.text.trim();
    if (!t) continue;
    if (isMetric(t)) metrics.push(t);
    else tools.push(...splitItems(t, true));
  }

  const plain = segments.map((s) => s.text).join("");
  for (const name of known) {
    if (name.length < 2) continue;
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9+#])`, "i");
    if (re.test(plain)) tools.push(name);
  }

  return { tools: dedupeCI(tools), metrics: dedupeCI(metrics) };
}

export function makeBullet(text: string, known: string[]): Bullet {
  return { id: uid("b"), text, ...analyzeBullet(text, known) };
}

export type FitStatus =
  | "empty"
  | "ideal-1"
  | "short-1"
  | "ideal-2"
  | "orphan-2"
  | "overflow";

export interface BulletFitResult {
  length: number;
  status: FitStatus;
  targetLines: 1 | 2 | 3;
  line1Progress: number; // 0 to 1
  line2Progress: number; // 0 to 1
  overallRatio: number; // 0 to 1
  label: string;
  tooltip: string;
  badge: "1L" | "2L" | ">2L" | "—";
  tone: "neutral" | "green" | "amber" | "red";
}

/**
 * Evaluates how well a bullet fills 1 or 2 lines based on calibrated LaTeX character limits.
 *
 * Status thresholds:
 * - 1-liner: 82%+ fill = green (full line); <82% = amber (short line).
 * - 2-liner: line 2 fill 65%+ = green (full 2 lines); <65% = amber (orphan word/short line 2).
 * - >2-line max = red (overflow).
 */
export function bulletFit(
  markup: string,
  config: CalibrationConfig = DEFAULT_CALIBRATION
): BulletFitResult {
  const length = plainText(markup).trim().length;
  const oneLineMax = Math.max(1, config.oneLineMax || DEFAULT_CALIBRATION.oneLineMax);
  const twoLineMax = Math.max(oneLineMax + 1, config.twoLineMax || DEFAULT_CALIBRATION.twoLineMax);

  if (length === 0) {
    return {
      length: 0,
      status: "empty",
      targetLines: 1,
      line1Progress: 0,
      line2Progress: 0,
      overallRatio: 0,
      label: "Empty",
      tooltip: "No bullet text",
      badge: "—",
      tone: "neutral",
    };
  }

  const line2Capacity = Math.max(1, twoLineMax - oneLineMax);

  if (length <= oneLineMax) {
    const p1 = length / oneLineMax;
    const isIdeal = p1 >= 0.82;
    const pct = Math.round(p1 * 100);
    return {
      length,
      status: isIdeal ? "ideal-1" : "short-1",
      targetLines: 1,
      line1Progress: Math.min(1, p1),
      line2Progress: 0,
      overallRatio: Math.min(1, length / twoLineMax),
      label: isIdeal ? "1 line full" : "Short 1-line",
      tooltip: `${length}/${oneLineMax} chars (${pct}% of line 1) · ${isIdeal ? "clean 1-liner" : "underfilled 1-liner"}`,
      badge: "1L",
      tone: isIdeal ? "green" : "amber",
    };
  }

  if (length <= twoLineMax) {
    const line2Chars = length - oneLineMax;
    const p2 = line2Chars / line2Capacity;
    const isIdeal = p2 >= 0.65;
    const pct2 = Math.round(p2 * 100);
    return {
      length,
      status: isIdeal ? "ideal-2" : "orphan-2",
      targetLines: 2,
      line1Progress: 1,
      line2Progress: Math.min(1, p2),
      overallRatio: Math.min(1, length / twoLineMax),
      label: isIdeal ? "2 lines full" : "Orphan line 2",
      tooltip: `${length}/${twoLineMax} chars · line 2 is ${pct2}% filled (${line2Chars}/${line2Capacity} chars) · ${isIdeal ? "clean 2-liner" : "orphan line wrap"}`,
      badge: "2L",
      tone: isIdeal ? "green" : "amber",
    };
  }

  // Overflow past 2 lines
  return {
    length,
    status: "overflow",
    targetLines: 3,
    line1Progress: 1,
    line2Progress: 1,
    overallRatio: 1,
    label: "> 2 lines (overflow)",
    tooltip: `${length}/${twoLineMax} chars (${length - twoLineMax} chars over 2-line max)`,
    badge: ">2L",
    tone: "red",
  };
}

export function knownTools(skillNames: string[], techStacks: string[][]): string[] {
  return dedupeCI([...skillNames, ...techStacks.flat()]);
}
