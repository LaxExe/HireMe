import type { Bullet } from "./types";

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

const CHARS_PER_LINE = 112;

export type FitStatus = "empty" | "ideal" | "short" | "orphan" | "long";

/** Estimate how well a bullet fills its lines on the resume template. */
export function bulletFit(markup: string): {
  length: number;
  lines: number;
  ratio: number;
  status: FitStatus;
} {
  const length = plainText(markup).trim().length;
  if (length === 0) return { length, lines: 0, ratio: 0, status: "empty" };
  const lines = Math.ceil(length / CHARS_PER_LINE);
  const lastFill = (length - (lines - 1) * CHARS_PER_LINE) / CHARS_PER_LINE;
  const ratio = Math.min(length / (CHARS_PER_LINE * 2), 1);
  let status: FitStatus = "ideal";
  if (lines >= 3) status = "long";
  else if (lines === 1 && lastFill < 0.75) status = "short";
  else if (lines === 2 && lastFill < 0.6) status = "orphan";
  return { length, lines, ratio, status };
}

export function knownTools(skillNames: string[], techStacks: string[][]): string[] {
  return dedupeCI([...skillNames, ...techStacks.flat()]);
}
