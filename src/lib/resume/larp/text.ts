import { markupToLatex } from "../latex";
import { bulletFit, escapeRegExp, plainText } from "../utils";
import {
  COMPRESSION_RULES,
  DEFAULT_CALIBRATION,
  NARROW_CHARS,
  SINGLE_LINE_NCU,
  UPPER_CHARS,
  WIDE_CHARS,
} from "./config";
import type {
  CalibrationConfig,
  LineBudgetCheck,
  TextSegment,
  WordDiffToken,
  WordReframeStats,
} from "./types";

export { bulletFit };

export function containsPhrase(haystack: string, phrase: string): boolean {
  const clean = phrase.trim();
  if (!clean) return false;
  const re = new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegExp(clean)}(?![A-Za-z0-9+#])`, "i");
  return re.test(haystack);
}

/**
 * Parses a LaTeX bullet string (`\textbf{...}`) OR internal markup string (`**...**`)
 * into a list of `(text_segment, is_bold)` tuples.
 */
export function stripLatexCommandsKeepText(inputStr: string): TextSegment[] {
  if (!inputStr) return [];

  const normalized = inputStr.includes("**")
    ? inputStr.replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}")
    : inputStr;

  const cleaned = normalized
    .replace(/^\\item\s+/, "")
    .replace(/^\\resumeItem\{([\s\S]*)\}$/, "$1")
    .replace(/\\([%$&_{}#])/g, "$1")
    .replace(/\$\\sim\$/g, "~");

  const segments: TextSegment[] = [];
  let pos = 0;
  const pattern = /\\textbf\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    if (match.index > pos) {
      segments.push({ text: cleaned.slice(pos, match.index), isBold: false });
    }
    segments.push({ text: match[1], isBold: true });
    pos = match.index + match[0].length;
  }

  if (pos < cleaned.length) {
    segments.push({ text: cleaned.slice(pos), isBold: false });
  }

  return segments;
}

/**
 * Computes the visual width in Normalized Character Units (NCU).
 * 1 standard line at 0.4in-0.5in margins is approximately 98.0 NCU.
 */
export function computeVisualWidth(latexOrMarkupStr: string): number {
  const segments = stripLatexCommandsKeepText(latexOrMarkupStr);
  let totalWidth = 0.0;

  for (const { text, isBold } of segments) {
    const boldMultiplier = isBold ? 1.12 : 1.0;
    for (const ch of text) {
      let w = 1.0;
      if (NARROW_CHARS.has(ch)) {
        w = 0.52;
      } else if (WIDE_CHARS.has(ch)) {
        w = 1.42;
      } else if (UPPER_CHARS.has(ch)) {
        w = 1.22;
      }
      totalWidth += w * boldMultiplier;
    }
  }

  return Number(totalWidth.toFixed(2));
}

/**
 * Checks whether the candidate fits within the calibrated 1-line (`oneLineMax`)
 * or 2-line (`twoLineMax`) area without overflowing.
 */
export function checkLineBudget(
  originalMarkup: string,
  candidateMarkup: string,
  calibration: CalibrationConfig = DEFAULT_CALIBRATION,
  singleLineNcu = SINGLE_LINE_NCU
): LineBudgetCheck {
  const origLatex = `\\item ${markupToLatex(originalMarkup)}`;
  const candLatex = `\\item ${markupToLatex(candidateMarkup)}`;

  const origWidth = computeVisualWidth(origLatex);
  const candWidth = computeVisualWidth(candLatex);

  const origFit = bulletFit(originalMarkup, calibration);
  const candFit = bulletFit(candidateMarkup, calibration);

  const origLines = origFit.targetLines === 1 ? 1 : 2;
  const candLines = candFit.targetLines;

  const maxAllowedChars =
    candLines === 1 ? calibration.oneLineMax : calibration.twoLineMax;
  const maxAllowedWidth = Number((candLines * singleLineNcu).toFixed(2));
  const minAllowedWidth = Number(
    ((candLines - 1) * singleLineNcu + 0.65 * singleLineNcu).toFixed(2)
  );
  const slackNcu = Number((maxAllowedWidth - origWidth).toFixed(2));

  // Valid if it lands in the calibrated 1-line or 2-line area (never >2L overflow, and ideally green 1L or 2L)
  const valid =
    candFit.status !== "overflow" &&
    candFit.length <= maxAllowedChars &&
    (candFit.tone === "green" || candFit.targetLines <= origLines);

  return {
    valid,
    origWidth,
    candWidth,
    origLines,
    candLines,
    maxAllowedWidth,
    minAllowedWidth,
    slackNcu,
    delta: Number((candWidth - origWidth).toFixed(2)),
    origChars: origFit.length,
    candChars: candFit.length,
    origFit,
    candFit,
  };
}

/**
 * Rewrites/tightens a modified bullet so its character length fits cleanly inside
 * the user's calibrated 1-line area (`<= oneLineMax`) or 2-line area (`<= twoLineMax`)
 * without overflowing or leaving an awkward orphan wrap.
 */
export function fitBulletToCalibratedLineArea(
  candidateMarkup: string,
  calibration: CalibrationConfig = DEFAULT_CALIBRATION
): string {
  let current = candidateMarkup.trim();
  const oneMax = Math.max(1, calibration.oneLineMax || DEFAULT_CALIBRATION.oneLineMax);
  const twoMax = Math.max(oneMax + 1, calibration.twoLineMax || DEFAULT_CALIBRATION.twoLineMax);

  let fit = bulletFit(current, calibration);

  // Case 1: The bullet is slightly over 1-line max (e.g., 109..136 chars — an accidental 2-line orphan!)
  // Try compressing filler phrases so it fits cleanly inside the 1-line area (`<= oneMax`, Green `1L`)!
  if (fit.length > oneMax && fit.length <= oneMax + 28) {
    let test1L = current;
    for (const [pattern, replacement] of COMPRESSION_RULES) {
      if (plainText(test1L).trim().length <= oneMax) break;
      if (pattern.test(test1L)) {
        test1L = test1L.replace(pattern, replacement).replace(/\s{2,}/g, " ").trim();
      }
    }
    const after1LFit = bulletFit(test1L, calibration);
    if (after1LFit.length <= oneMax && after1LFit.tone === "green") {
      return test1L;
    }
  }

  // Case 2: The bullet exceeds `twoLineMax` (> 2 lines overflow).
  // Apply surgical phrase tightenings until `length <= twoMax` (fits inside 2-line area).
  if (fit.length > twoMax) {
    for (const [pattern, replacement] of COMPRESSION_RULES) {
      if (plainText(current).trim().length <= twoMax) break;
      if (pattern.test(current)) {
        current = current.replace(pattern, replacement).replace(/\s{2,}/g, " ").trim();
      }
    }
    fit = bulletFit(current, calibration);
  }

  // Case 3: The bullet is in the 2-line range (`> oneMax` and `<= twoMax`), but is an `orphan-2`
  // (line 2 is < 65% filled). If it cannot compress to 1 line, add a concise, context-matching
  // technical clause so it fills the 2-line area (`ideal-2` Green) cleanly!
  if (fit.status === "orphan-2") {
    const minIdeal2 = oneMax + Math.ceil(0.65 * (twoMax - oneMax));
    const needed = minIdeal2 - fit.length;
    if (needed > 0 && needed <= 48) {
      if (/\bPostgreSQL\b/i.test(current) && !/low-latency/i.test(current)) {
        const expanded = current.replace(
          /\.$/,
          " for low-latency data access and schema consistency."
        );
        if (bulletFit(expanded, calibration).tone === "green") {
          return expanded;
        }
      }
      if (/\bSupabase\b|\bFlask\b|\bAPIs\b/i.test(current) && !/automated retries/i.test(current)) {
        const expanded = current.replace(
          /\.$/,
          " with automated schema validation and retry handling."
        );
        if (bulletFit(expanded, calibration).tone === "green") {
          return expanded;
        }
      }
    }
  }

  return current;
}

function normalizeWordForDiff(w: string): string {
  return w
    .replace(/\*\*/g, "")
    .replace(/^[^a-zA-Z0-9%+#.]+|[^a-zA-Z0-9%+#.]+$/g, "")
    .toLowerCase();
}

export function computeWordReframeStats(
  originalMarkup: string,
  candidateMarkup: string,
  maxWordsCap = 7
): WordReframeStats {
  const origWords = plainText(originalMarkup).trim().split(/\s+/).filter(Boolean);
  const candRawWords = candidateMarkup.trim().split(/\s+/).filter(Boolean);
  const origNorm = origWords.map(normalizeWordForDiff);
  const candNorm = candRawWords.map(normalizeWordForDiff);

  const m = origNorm.length;
  const n = candNorm.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origNorm[i] && origNorm[i] === candNorm[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const tokens: WordDiffToken[] = [];
  let i = 0;
  let j = 0;
  let reframedWords = 0;

  while (j < n) {
    if (i < m && origNorm[i] === candNorm[j]) {
      tokens.push({ word: candRawWords[j], changed: false });
      i++;
      j++;
    } else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      tokens.push({ word: candRawWords[j], changed: true });
      reframedWords++;
      j++;
    }
  }

  return {
    reframedWords,
    withinCap: reframedWords > 0 && reframedWords <= maxWordsCap,
    tokens,
  };
}
