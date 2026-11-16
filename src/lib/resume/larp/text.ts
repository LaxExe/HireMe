import { HELVETICA_WIDTHS, measureRenderedBulletLineCount } from "../exportPdf";
import { markupToLatex } from "../latex";
import { DEFAULT_RESUME_FORMAT, type MasterResume, type ResumeFormat } from "../types";
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

export interface Measurer {
  width(text: string, bold?: boolean): number;
}

/**
 * Heuristic NCU measurer retained as fallback.
 */
export const heuristicMeasurer: Measurer = {
  width(text: string, bold = false): number {
    const boldMultiplier = bold ? 1.12 : 1.0;
    let totalWidth = 0.0;
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
    return Number(totalWidth.toFixed(2));
  },
};

/**
 * Real AFM font-metric measurer using the resume template's actual Helvetica regular/bold glyph widths,
 * backed by a per-glyph width cache and scaled so one printable line equals `targetLineUnits` (default 108.0).
 */
export function createFontMetricMeasurer(
  format: ResumeFormat = DEFAULT_RESUME_FORMAT,
  targetLineUnits = 108.0
): Measurer {
  const pageWidth = format.paperSize === "a4" ? 595.28 : 612;
  const marginLeft = Math.max(24, format.margins.leftIn * 72);
  const marginRight = Math.max(24, format.margins.rightIn * 72);
  const contentWidth = pageWidth - marginLeft - marginRight;
  const scale = format.fontScale || 1.0;
  const basePt = format.baseFontSizePt * scale;
  const smallPt = (format.baseFontSizePt - 1) * scale;
  const bulletPt = format.bulletStyle.smallText ? smallPt : basePt;
  const indentPt = Math.max(10, format.bulletStyle.leftMarginIn * 72);
  const availWidthPt = Math.max(100, contentWidth - indentPt);

  const regularGlyphCache = new Map<string, number>();
  const boldGlyphCache = new Map<string, number>();

  const getCharUnits = (ch: string, bold: boolean): number => {
    const cache = bold ? boldGlyphCache : regularGlyphCache;
    const hit = cache.get(ch);
    if (hit !== undefined) return hit;

    const pair = HELVETICA_WIDTHS[ch];
    const w1000 = pair ? (bold ? pair[1] : pair[0]) : bold ? 580 : 530;
    const widthPt = (w1000 / 1000) * bulletPt;
    const units = (widthPt / availWidthPt) * targetLineUnits;
    cache.set(ch, units);
    return units;
  };

  return {
    width(text: string, bold = false): number {
      let total = 0;
      for (let i = 0; i < text.length; i++) {
        total += getCharUnits(text[i], bold);
      }
      return Number(total.toFixed(2));
    },
  };
}

export const defaultFontMeasurer: Measurer = createFontMetricMeasurer(
  DEFAULT_RESUME_FORMAT,
  108.0
);

export function measureMarkupWithMeasurer(
  latexOrMarkupStr: string,
  measurer: Measurer = defaultFontMeasurer
): number {
  const segments = stripLatexCommandsKeepText(latexOrMarkupStr);
  let total = 0;
  for (const seg of segments) {
    total += measurer.width(seg.text, seg.isBold);
  }
  return Number(total.toFixed(2));
}

export interface PdfRenderCalibrationAudit {
  totalBullets: number;
  agreedCount: number;
  discrepancies: {
    bulletId: string;
    predictedLines: number;
    renderedLines: number;
    chars: number;
    fontMetricUnits: number;
  }[];
  calibrationValid: boolean;
}

/**
 * Compares the PDF renderer's actual wrapped line count per bullet against the engine's prediction
 * to validate `DEFAULT_CALIBRATION`.
 */
export function verifyPdfRenderLineCounts(
  resume: MasterResume
): PdfRenderCalibrationAudit {
  const cal = resume.calibration ?? DEFAULT_CALIBRATION;
  const fmt = resume.format ?? DEFAULT_RESUME_FORMAT;
  const oneMax = cal.oneLineMax || 108;
  const measurer = createFontMetricMeasurer(fmt, oneMax);

  const allBullets = [
    ...resume.experience.flatMap((j) => j.bullets),
    ...resume.projects.flatMap((p) => p.bullets),
  ];

  const discrepancies: PdfRenderCalibrationAudit["discrepancies"] = [];
  let agreedCount = 0;

  for (const b of allBullets) {
    if (!b.text.trim()) continue;
    const fit = bulletFit(b.text, cal);
    const fontMetricUnits = measureMarkupWithMeasurer(b.text, measurer);
    const predictedLines = fontMetricUnits <= oneMax ? 1 : fontMetricUnits <= oneMax * 2 ? 2 : 3;
    const rendered = measureRenderedBulletLineCount(b.text, fmt);

    if (predictedLines === rendered.lineCount) {
      agreedCount++;
    } else {
      discrepancies.push({
        bulletId: b.id,
        predictedLines,
        renderedLines: rendered.lineCount,
        chars: fit.length,
        fontMetricUnits,
      });
    }
  }

  return {
    totalBullets: allBullets.length,
    agreedCount,
    discrepancies,
    calibrationValid: discrepancies.length === 0,
  };
}

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
export function computeVisualWidth(
  latexOrMarkupStr: string,
  measurer: Measurer = heuristicMeasurer
): number {
  const segments = stripLatexCommandsKeepText(latexOrMarkupStr);
  let totalWidth = 0.0;

  for (const { text, isBold } of segments) {
    totalWidth += measurer.width(text, isBold);
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
  singleLineNcu = SINGLE_LINE_NCU,
  measurer: Measurer = heuristicMeasurer
): LineBudgetCheck {
  const origLatex = `\\item ${markupToLatex(originalMarkup)}`;
  const candLatex = `\\item ${markupToLatex(candidateMarkup)}`;

  const origWidth = computeVisualWidth(origLatex, measurer);
  const candWidth = computeVisualWidth(candLatex, measurer);

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
 * without overflowing or injecting generic ungrounded filler clauses.
 */
export function fitBulletToCalibratedLineArea(
  candidateMarkup: string,
  calibration: CalibrationConfig = DEFAULT_CALIBRATION
): string {
  let current = candidateMarkup.trim();
  const oneMax = Math.max(1, calibration.oneLineMax || DEFAULT_CALIBRATION.oneLineMax);
  const twoMax = Math.max(oneMax + 1, calibration.twoLineMax || DEFAULT_CALIBRATION.twoLineMax);

  const fit = bulletFit(current, calibration);

  // Case 1: The bullet is slightly over 1-line max (e.g., 109..136 chars — an accidental 2-line orphan!)
  // Compress filler phrases so it fits cleanly inside the 1-line area (`<= oneMax`, Green `1L`).
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
  }

  // Case 3: The bullet is in the 2-line range (`> oneMax` and `<= twoMax`), but is an `orphan-2`
  // (line 2 is < 65% filled). Try compressing filler phrases so it fits cleanly on 1 line,
  // WITHOUT appending generic filler clauses.
  const updatedFit = bulletFit(current, calibration);
  if (updatedFit.status === "orphan-2") {
    let testTighten = current;
    for (const [pattern, replacement] of COMPRESSION_RULES) {
      if (pattern.test(testTighten)) {
        testTighten = testTighten.replace(pattern, replacement).replace(/\s{2,}/g, " ").trim();
      }
    }
    if (bulletFit(testTighten, calibration).tone === "green") {
      return testTighten;
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
