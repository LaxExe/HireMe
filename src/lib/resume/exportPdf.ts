import {
  DEFAULT_RESUME_FORMAT,
  hasResumeSection,
  type MasterResume,
  type ResumeFormat,
  type ResumeSectionKey,
} from "./types";
import { parseMarkup } from "./utils";

type FontVariant = "regular" | "bold" | "italic" | "boldItalic";

interface StyledSpan {
  text: string;
  font: FontVariant;
  gray?: number; // 0 = black, 0.35 = muted
  underline?: boolean;
  linkUrl?: string;
}

interface LinkAnnotation {
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

interface PageStream {
  ops: string[];
  links: LinkAnnotation[];
}

/**
 * Standard Adobe AFM character widths (1/1000 em) for Helvetica ( Regular & Bold )
 * so line wrapping and right-alignment match PDF viewer Type1 rendering.
 */
const HELVETICA_WIDTHS: Record<string, [number, number]> = {
  " ": [278, 278],
  "!": [278, 333],
  '"': [355, 474],
  "#": [556, 556],
  $: [556, 556],
  "%": [889, 889],
  "&": [667, 722],
  "'": [191, 238],
  "(": [333, 333],
  ")": [333, 333],
  "*": [389, 389],
  "+": [584, 584],
  ",": [278, 278],
  "-": [333, 333],
  ".": [278, 278],
  "/": [278, 278],
  "0": [556, 556],
  "1": [556, 556],
  "2": [556, 556],
  "3": [556, 556],
  "4": [556, 556],
  "5": [556, 556],
  "6": [556, 556],
  "7": [556, 556],
  "8": [556, 556],
  "9": [556, 556],
  ":": [278, 333],
  ";": [278, 333],
  "<": [584, 584],
  "=": [584, 584],
  ">": [584, 584],
  "?": [556, 611],
  "@": [1015, 975],
  A: [667, 722],
  B: [667, 722],
  C: [722, 722],
  D: [722, 722],
  E: [667, 667],
  F: [611, 611],
  G: [778, 778],
  H: [722, 722],
  I: [278, 278],
  J: [500, 556],
  K: [667, 722],
  L: [556, 611],
  M: [833, 833],
  N: [722, 722],
  O: [778, 778],
  P: [667, 667],
  Q: [778, 778],
  R: [722, 722],
  S: [667, 667],
  T: [611, 611],
  U: [722, 722],
  V: [667, 667],
  W: [944, 944],
  X: [667, 667],
  Y: [667, 667],
  Z: [611, 611],
  "[": [278, 333],
  "\\": [278, 278],
  "]": [278, 333],
  "^": [469, 584],
  _: [556, 556],
  "`": [333, 333],
  a: [556, 556],
  b: [556, 611],
  c: [500, 556],
  d: [556, 611],
  e: [556, 556],
  f: [278, 333],
  g: [556, 611],
  h: [556, 611],
  i: [222, 278],
  j: [222, 278],
  k: [500, 556],
  l: [222, 278],
  m: [833, 889],
  n: [556, 611],
  o: [556, 611],
  p: [556, 611],
  q: [556, 611],
  r: [333, 389],
  s: [500, 556],
  t: [278, 333],
  u: [556, 611],
  v: [500, 556],
  w: [722, 778],
  x: [500, 556],
  y: [500, 556],
  z: [500, 500],
  "{": [334, 389],
  "|": [260, 280],
  "}": [334, 389],
  "~": [584, 584],
  "•": [350, 350],
  "–": [556, 556],
  "—": [1000, 1000],
  "·": [278, 278],
  "×": [584, 584],
  "≈": [584, 584],
};

function charWidthPt(ch: string, font: FontVariant, sizePt: number): number {
  const isBold = font === "bold" || font === "boldItalic";
  const pair = HELVETICA_WIDTHS[ch];
  const w1000 = pair ? (isBold ? pair[1] : pair[0]) : isBold ? 580 : 530;
  return (w1000 / 1000) * sizePt;
}

function measureTextPt(text: string, font: FontVariant, sizePt: number): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += charWidthPt(text[i], font, sizePt);
  }
  return total;
}

function fontResourceName(font: FontVariant): string {
  switch (font) {
    case "bold":
      return "/F2";
    case "italic":
      return "/F3";
    case "boldItalic":
      return "/F4";
    default:
      return "/F1";
  }
}

/**
 * Convert Unicode string into WinAnsi (CP1252) escaped PDF literal string `(...)`.
 */
function toPdfLiteralString(input: string): string {
  const normalized = input
    .replace(/≈/g, "~")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  let out = "(";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const code = normalized.charCodeAt(i);
    if (ch === "(" || ch === ")" || ch === "\\") {
      out += "\\" + ch;
    } else if (ch === "•") {
      out += "\\225"; // 0x95 in octal
    } else if (ch === "–") {
      out += "\\226"; // 0x96 in octal
    } else if (ch === "—") {
      out += "\\227"; // 0x97 in octal
    } else if (ch === "·") {
      out += "\\267"; // 0xB7 in octal
    } else if (ch === "×") {
      out += "\\327"; // 0xD7 in octal
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (code >= 160 && code <= 255) {
      out += "\\" + code.toString(8).padStart(3, "0");
    } else {
      out += " ";
    }
  }
  out += ")";
  return out;
}

function num(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/**
 * Tokenize styled spans into word tokens so we can wrap multi-span rich text across lines.
 */
interface WordToken {
  text: string;
  font: FontVariant;
  gray: number;
  underline?: boolean;
  linkUrl?: string;
  widthPt: number;
}

function tokenizeSpans(spans: StyledSpan[], sizePt: number): WordToken[] {
  const tokens: WordToken[] = [];
  for (const span of spans) {
    const gray = span.gray ?? 0.08;
    const parts = span.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      tokens.push({
        text: part,
        font: span.font,
        gray,
        underline: span.underline,
        linkUrl: span.linkUrl,
        widthPt: measureTextPt(part, span.font, sizePt),
      });
    }
  }
  return tokens;
}

function wrapTokens(tokens: WordToken[], maxWidthPt: number): WordToken[][] {
  const lines: WordToken[][] = [];
  let currentLine: WordToken[] = [];
  let currentWidth = 0;

  for (const tok of tokens) {
    const isSpace = /^\s+$/.test(tok.text);
    if (currentLine.length === 0 && isSpace) {
      continue;
    }
    if (currentLine.length > 0 && currentWidth + tok.widthPt > maxWidthPt && !isSpace) {
      // Trim trailing whitespace token from current line
      while (currentLine.length > 0 && /^\s+$/.test(currentLine[currentLine.length - 1].text)) {
        currentLine.pop();
      }
      lines.push(currentLine);
      currentLine = [tok];
      currentWidth = tok.widthPt;
    } else {
      currentLine.push(tok);
      currentWidth += tok.widthPt;
    }
  }

  while (currentLine.length > 0 && /^\s+$/.test(currentLine[currentLine.length - 1].text)) {
    currentLine.pop();
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
}

function markupToSpans(markup: string, baseGray = 0.08): StyledSpan[] {
  const segments = parseMarkup(markup);
  return segments.map((seg) => ({
    text: seg.text,
    font: seg.bold ? "bold" : "regular",
    gray: baseGray,
  }));
}

/**
 * Generates a vector PDF 1.4 binary buffer faithfully reproducing the uploaded LaTeX format
 * and incorporating all edits made in the Experience editor.
 */
export function generateResumePdfBytes(resume: MasterResume): Uint8Array {
  const fmt: ResumeFormat = resume.format ?? DEFAULT_RESUME_FORMAT;

  const pageWidth = fmt.paperSize === "a4" ? 595.28 : 612;
  const pageHeight = fmt.paperSize === "a4" ? 841.89 : 792;

  const marginLeft = Math.max(24, fmt.margins.leftIn * 72);
  const marginRight = Math.max(24, fmt.margins.rightIn * 72);
  const marginTop = Math.max(24, fmt.margins.topIn * 72);
  const marginBottom = Math.max(24, fmt.margins.bottomIn * 72);
  const contentWidth = pageWidth - marginLeft - marginRight;

  const scale = fmt.fontScale || 1.0;
  const basePt = fmt.baseFontSizePt * scale;
  const smallPt = (fmt.baseFontSizePt - 1) * scale;
  const sectionPt = (fmt.baseFontSizePt + 1.2) * scale;
  const namePt =
    fmt.headerStyle.nameSize === "Huge"
      ? (fmt.baseFontSizePt + 7) * scale
      : fmt.headerStyle.nameSize === "LARGE"
      ? (fmt.baseFontSizePt + 5) * scale
      : (fmt.baseFontSizePt + 3) * scale;

  const lineFactor = 1.18 * (fmt.lineSpread || 1.0);
  const mutedGray = fmt.entryStyle.rightMuted ? fmt.mutedGray : 0.08;
  const bodyGray = 0.08;

  const pages: PageStream[] = [{ ops: [], links: [] }];
  let curPage = pages[0];
  let cursorY = pageHeight - marginTop;

  const ensureSpace = (neededPt: number) => {
    if (cursorY - neededPt < marginBottom) {
      curPage = { ops: [], links: [] };
      pages.push(curPage);
      cursorY = pageHeight - marginTop;
    }
  };

  const drawTextSpan = (
    text: string,
    x: number,
    y: number,
    font: FontVariant,
    sizePt: number,
    gray = bodyGray,
    underline = false,
    linkUrl?: string
  ): number => {
    if (!text) return 0;
    const w = measureTextPt(text, font, sizePt);
    curPage.ops.push(
      `BT ${num(gray)} g ${fontResourceName(font)} ${num(sizePt)} Tf ${num(x)} ${num(y)} Td ${toPdfLiteralString(
        text
      )} Tj ET`
    );
    if (underline) {
      const uy = y - 1.5;
      curPage.ops.push(
        `${num(gray)} G 0.45 w ${num(x)} ${num(uy)} m ${num(x + w)} ${num(uy)} l S`
      );
    }
    if (linkUrl) {
      const fullUrl =
        linkUrl.startsWith("http") || linkUrl.startsWith("mailto:")
          ? linkUrl
          : `https://${linkUrl}`;
      curPage.links.push({
        x,
        y: y - 2,
        w,
        h: sizePt + 3,
        url: fullUrl,
      });
    }
    return w;
  };

  const drawTokenLine = (tokens: WordToken[], startX: number, y: number, sizePt: number) => {
    // Merge adjacent tokens that share identical styling & no link boundary so kerning is smooth
    let x = startX;
    for (const tok of tokens) {
      const w = drawTextSpan(
        tok.text,
        x,
        y,
        tok.font,
        sizePt,
        tok.gray,
        tok.underline,
        tok.linkUrl
      );
      x += w;
    }
  };

  /* ------------------------------- 1. Header ------------------------------- */
  if (hasResumeSection(resume, "contact")) {
    const { contact } = resume;
    if (contact.name) {
      ensureSpace(namePt + 6);
      cursorY -= namePt * 0.85;
      const nameFont: FontVariant = fmt.headerStyle.nameBold ? "bold" : "regular";
      const nameW = measureTextPt(contact.name, nameFont, namePt);
      const nameX =
        fmt.headerStyle.alignment === "center"
          ? marginLeft + Math.max(0, (contentWidth - nameW) / 2)
          : marginLeft;
      drawTextSpan(contact.name, nameX, cursorY, nameFont, namePt, 0.05);
      cursorY -= 5;
    }

    // Build contact items
    const contactItems: StyledSpan[] = [];
    if (contact.location) {
      contactItems.push({ text: contact.location, font: "regular", gray: bodyGray });
    }
    if (contact.phone) {
      contactItems.push({ text: contact.phone, font: "regular", gray: bodyGray });
    }
    if (contact.email) {
      contactItems.push({
        text: contact.email,
        font: "regular",
        gray: bodyGray,
        underline: fmt.headerStyle.underlineLinks,
        linkUrl: `mailto:${contact.email}`,
      });
    }
    for (const link of contact.links) {
      const label = link.label || link.url;
      if (!label) continue;
      contactItems.push({
        text: label,
        font: "regular",
        gray: bodyGray,
        underline: fmt.headerStyle.underlineLinks,
        linkUrl: link.url || label,
      });
    }

    if (contactItems.length > 0) {
      const sepChar =
        fmt.headerStyle.separator === "bar"
          ? "  |  "
          : fmt.headerStyle.separator === "bullet"
          ? "  •  "
          : "  ·  ";

      const lineSpans: StyledSpan[] = [];
      contactItems.forEach((item, idx) => {
        if (idx > 0) {
          lineSpans.push({ text: sepChar, font: "regular", gray: mutedGray });
        }
        lineSpans.push(item);
      });

      const contactPt = smallPt;
      const tokens = tokenizeSpans(lineSpans, contactPt);
      const wrapped = wrapTokens(tokens, contentWidth);
      for (const line of wrapped) {
        ensureSpace(contactPt * lineFactor);
        cursorY -= contactPt * lineFactor;
        const lineW = line.reduce((acc, t) => acc + t.widthPt, 0);
        const startX =
          fmt.headerStyle.alignment === "center"
            ? marginLeft + Math.max(0, (contentWidth - lineW) / 2)
            : marginLeft;
        drawTokenLine(line, startX, cursorY, contactPt);
      }
      cursorY -= 4;
    }
  }

  /* -------------------------- Section Header Helper ------------------------- */
  const drawSectionHeading = (rawTitle: string) => {
    const title = fmt.sectionStyle.uppercase ? rawTitle.toUpperCase() : rawTitle;
    const spaceAbove = fmt.sectionStyle.spaceAbovePt ?? 7;
    const spaceBelow = fmt.sectionStyle.spaceBelowPt ?? 4;

    ensureSpace(spaceAbove + sectionPt + spaceBelow + 22);
    cursorY -= spaceAbove + sectionPt * 0.85;

    drawTextSpan(
      title,
      marginLeft,
      cursorY,
      fmt.sectionStyle.bold ? "bold" : "regular",
      sectionPt,
      0.05
    );

    if (fmt.sectionStyle.hasRule) {
      cursorY -= 3.5;
      const ruleW = fmt.sectionStyle.ruleHeightPt || 0.5;
      curPage.ops.push(
        `0.15 G ${num(ruleW)} w ${num(marginLeft)} ${num(cursorY)} m ${num(
          marginLeft + contentWidth
        )} ${num(cursorY)} l S`
      );
    }

    cursorY -= spaceBelow;
  };

  /* -------------------------- Subheading Pair Helper ------------------------- */
  const drawTwoLineSubheading = (
    line1Left: StyledSpan[],
    line1Right: string,
    line2Left: StyledSpan[],
    line2Right: string
  ) => {
    const row1Pt = basePt;
    const row2Pt = fmt.entryStyle.line2Bold ? basePt : smallPt;
    const rightFont: FontVariant = fmt.entryStyle.rightItalic ? "italic" : "regular";
    const rightGray = fmt.entryStyle.rightMuted ? mutedGray : bodyGray;

    ensureSpace((row1Pt + row2Pt) * lineFactor + 6);

    // Line 1
    cursorY -= row1Pt * lineFactor;
    let x1 = marginLeft;
    for (const sp of line1Left) {
      x1 += drawTextSpan(sp.text, x1, cursorY, sp.font, row1Pt, sp.gray ?? bodyGray, sp.underline, sp.linkUrl);
    }
    if (line1Right) {
      const rw1 = measureTextPt(line1Right, rightFont, row1Pt);
      drawTextSpan(
        line1Right,
        marginLeft + contentWidth - rw1,
        cursorY,
        rightFont,
        row1Pt,
        rightGray
      );
    }

    // Line 2
    cursorY -= row2Pt * 1.15;
    let x2 = marginLeft;
    for (const sp of line2Left) {
      x2 += drawTextSpan(sp.text, x2, cursorY, sp.font, row2Pt, sp.gray ?? bodyGray, sp.underline, sp.linkUrl);
    }
    if (line2Right) {
      const rw2 = measureTextPt(line2Right, rightFont, row2Pt);
      drawTextSpan(
        line2Right,
        marginLeft + contentWidth - rw2,
        cursorY,
        rightFont,
        row2Pt,
        rightGray
      );
    }
  };

  /* ---------------------------- Bullet List Helper --------------------------- */
  const drawBullets = (bullets: { text: string }[]) => {
    if (bullets.length === 0) return;
    const bulletPt = fmt.bulletStyle.smallText ? smallPt : basePt;
    const indentPt = Math.max(10, fmt.bulletStyle.leftMarginIn * 72);
    const bulletMarkerX = marginLeft + Math.max(2, indentPt - 8);
    const textStartX = marginLeft + indentPt;
    const availWidth = contentWidth - indentPt;

    cursorY -= fmt.bulletStyle.topSepPt;

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.text.trim()) continue;
      const spans = markupToSpans(b.text, bodyGray);
      const tokens = tokenizeSpans(spans, bulletPt);
      const lines = wrapTokens(tokens, availWidth);

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        ensureSpace(bulletPt * lineFactor + 2);
        cursorY -= bulletPt * lineFactor;
        if (lineIdx === 0) {
          drawTextSpan("•", bulletMarkerX, cursorY, "regular", bulletPt, bodyGray);
        }
        drawTokenLine(lines[lineIdx], textStartX, cursorY, bulletPt);
      }

      if (i + 1 < bullets.length) {
        cursorY -= fmt.bulletStyle.itemSepPt;
      }
    }
  };

  /* ------------------------- Section Renderers ------------------------- */
  const renderSection = (key: ResumeSectionKey) => {
    if (!hasResumeSection(resume, key)) return;

    if (key === "education" && resume.education.length > 0) {
      drawSectionHeading(fmt.sectionStyle.titles.education || "Education");
      resume.education.forEach((edu, idx) => {
        if (idx > 0) cursorY -= fmt.entryStyle.entrySpacingPt;
        drawTwoLineSubheading(
          [{ text: edu.institution, font: "bold" }],
          edu.location,
          [
            {
              text: edu.degree,
              font: fmt.entryStyle.line2Bold ? "bold" : "regular",
            },
          ],
          edu.dates
        );
      });
    } else if (key === "skills" && resume.skills.length > 0) {
      drawSectionHeading(fmt.sectionStyle.titles.skills || "Technical Skills");
      const skillPt = fmt.skillStyle.smallText ? smallPt : basePt;
      const isBulletList = fmt.skillStyle.layout === "itemize-bullets";
      const indentPt = isBulletList ? Math.max(10, fmt.bulletStyle.leftMarginIn * 72) : 0;
      const bulletX = marginLeft + Math.max(2, indentPt - 8);
      const startX = marginLeft + indentPt;
      const availWidth = contentWidth - indentPt;

      cursorY -= 1;
      for (const cat of resume.skills) {
        if (!cat.name && cat.skills.length === 0) continue;
        const skillNames = cat.skills.map((s) => s.name).filter(Boolean).join(", ");
        const spans: StyledSpan[] = [
          {
            text: fmt.skillStyle.colonInsideBold ? `${cat.name}: ` : cat.name,
            font: "bold",
            gray: bodyGray,
          },
          ...(!fmt.skillStyle.colonInsideBold
            ? [{ text: ": ", font: "regular" as const, gray: bodyGray }]
            : []),
          { text: skillNames, font: "regular", gray: bodyGray },
        ];

        const tokens = tokenizeSpans(spans, skillPt);
        const lines = wrapTokens(tokens, availWidth);
        lines.forEach((line, lineIdx) => {
          ensureSpace(skillPt * lineFactor + 2);
          cursorY -= skillPt * lineFactor;
          if (isBulletList && lineIdx === 0) {
            drawTextSpan("•", bulletX, cursorY, "regular", skillPt, bodyGray);
          }
          drawTokenLine(line, startX, cursorY, skillPt);
        });
        cursorY -= 1.5;
      }
    } else if (key === "experience" && resume.experience.length > 0) {
      drawSectionHeading(fmt.sectionStyle.titles.experience || "Experience");
      resume.experience.forEach((job, idx) => {
        if (idx > 0) cursorY -= fmt.entryStyle.entrySpacingPt;

        const companySpan: StyledSpan = {
          text: job.company,
          font: fmt.entryStyle.companyFirst || fmt.entryStyle.line2Bold ? "bold" : "regular",
          underline: Boolean(job.companyUrl),
          linkUrl: job.companyUrl || undefined,
        };
        const titleSpan: StyledSpan = {
          text: job.title,
          font: "bold",
        };

        if (fmt.entryStyle.companyFirst) {
          drawTwoLineSubheading([companySpan], job.location, [titleSpan], job.dates);
        } else {
          drawTwoLineSubheading([titleSpan], job.dates, [companySpan], job.location);
        }

        drawBullets(job.bullets);
      });
    } else if (key === "projects" && resume.projects.length > 0) {
      drawSectionHeading(fmt.sectionStyle.titles.projects || "Projects");
      resume.projects.forEach((proj, idx) => {
        if (idx > 0) cursorY -= fmt.entryStyle.entrySpacingPt;
        const rowPt = fmt.bulletStyle.smallText ? smallPt + 0.5 : basePt;
        ensureSpace(rowPt * lineFactor + 14);
        cursorY -= rowPt * lineFactor;

        const leftSpans: StyledSpan[] = [
          {
            text: proj.name,
            font: "bold",
            underline: Boolean(proj.url),
            linkUrl: proj.url || undefined,
          },
        ];
        if (proj.techStack.length > 0) {
          leftSpans.push({
            text: "  |  ",
            font: "regular",
            gray: mutedGray,
          });
          leftSpans.push({
            text: proj.techStack.join(", "),
            font: fmt.entryStyle.projectTechStyle === "italic" ? "italic" : "regular",
            gray: fmt.entryStyle.projectTechStyle === "muted" ? mutedGray : bodyGray,
          });
        }

        let x = marginLeft;
        for (const sp of leftSpans) {
          x += drawTextSpan(
            sp.text,
            x,
            cursorY,
            sp.font,
            rowPt,
            sp.gray ?? bodyGray,
            sp.underline,
            sp.linkUrl
          );
        }

        if (proj.meta) {
          const rightFont: FontVariant = fmt.entryStyle.rightItalic ? "italic" : "regular";
          const rightGray = fmt.entryStyle.rightMuted ? mutedGray : bodyGray;
          const rw = measureTextPt(proj.meta, rightFont, rowPt);
          drawTextSpan(
            proj.meta,
            marginLeft + contentWidth - rw,
            cursorY,
            rightFont,
            rowPt,
            rightGray
          );
        }

        drawBullets(proj.bullets);
      });
    } else if (key === "awards" && (resume.awards ?? []).length > 0) {
      drawSectionHeading(fmt.sectionStyle.titles.awards || "Scholarships & Awards");
      const awardPt = fmt.bulletStyle.smallText ? smallPt : basePt;
      const indentPt = Math.max(10, fmt.bulletStyle.leftMarginIn * 72);
      const bulletX = marginLeft + Math.max(2, indentPt - 8);
      const startX = marginLeft + indentPt;
      const availWidth = contentWidth - indentPt;

      for (const award of resume.awards ?? []) {
        ensureSpace(awardPt * lineFactor * 2 + 4);
        cursorY -= awardPt * lineFactor;
        drawTextSpan("•", bulletX, cursorY, "regular", awardPt, bodyGray);
        drawTextSpan(award.title, startX, cursorY, "bold", awardPt, bodyGray);

        if (award.date) {
          const rightFont: FontVariant = fmt.entryStyle.rightItalic ? "italic" : "regular";
          const rightGray = fmt.entryStyle.rightMuted ? mutedGray : bodyGray;
          const rw = measureTextPt(award.date, rightFont, awardPt);
          drawTextSpan(
            award.date,
            marginLeft + contentWidth - rw,
            cursorY,
            rightFont,
            awardPt,
            rightGray
          );
        }

        if (award.description) {
          const descTokens = tokenizeSpans(
            [{ text: award.description, font: "regular", gray: bodyGray }],
            awardPt
          );
          const descLines = wrapTokens(descTokens, availWidth);
          for (const line of descLines) {
            ensureSpace(awardPt * lineFactor + 2);
            cursorY -= awardPt * lineFactor;
            drawTokenLine(line, startX, cursorY, awardPt);
          }
        }
        cursorY -= fmt.bulletStyle.itemSepPt;
      }
    }
  };

  const orderedKeys: ResumeSectionKey[] = [...fmt.sectionStyle.order];
  for (const fallbackKey of ["education", "skills", "experience", "projects", "awards"] as const) {
    if (!orderedKeys.includes(fallbackKey)) {
      orderedKeys.push(fallbackKey);
    }
  }
  for (const key of orderedKeys) {
    renderSection(key);
  }

  /* ----------------------- 2. Assemble PDF 1.4 Objects ----------------------- */
  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length; // 1-based object ID
  };

  // Reserve 1 = Catalog, 2 = Pages
  addObj(""); // placeholder for 1
  addObj(""); // placeholder for 2

  const isSerif = fmt.fontFamily === "serif";
  const f1Id = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /${
      isSerif ? "Times-Roman" : "Helvetica"
    } /Encoding /WinAnsiEncoding >>`
  );
  const f2Id = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /${
      isSerif ? "Times-Bold" : "Helvetica-Bold"
    } /Encoding /WinAnsiEncoding >>`
  );
  const f3Id = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /${
      isSerif ? "Times-Italic" : "Helvetica-Oblique"
    } /Encoding /WinAnsiEncoding >>`
  );
  const f4Id = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /${
      isSerif ? "Times-BoldItalic" : "Helvetica-BoldOblique"
    } /Encoding /WinAnsiEncoding >>`
  );

  const pageIds: number[] = [];

  for (const p of pages) {
    const streamContent = p.ops.join("\n");
    const streamId = addObj(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);

    const annotIds: number[] = [];
    for (const link of p.links) {
      const safeUrl = link.url.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      const annotId = addObj(
        `<< /Type /Annot /Subtype /Link /Rect [${num(link.x)} ${num(link.y)} ${num(
          link.x + link.w
        )} ${num(link.y + link.h)}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${safeUrl}) >> >>`
      );
      annotIds.push(annotId);
    }

    const annotsEntry =
      annotIds.length > 0 ? `/Annots [${annotIds.map((id) => `${id} 0 R`).join(" ")}]` : "";

    const pageId = addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(
        pageHeight
      )}] /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R /F3 ${f3Id} 0 R /F4 ${f4Id} 0 R >> >> /Contents ${streamId} 0 R ${annotsEntry} >>`
    );
    pageIds.push(pageId);
  }

  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${
    pageIds.length
  } >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Trigger a browser download of the resume as `<name>.pdf`.
 */
export function downloadResumePdf(resume: MasterResume, rawName: string): void {
  const cleanName =
    rawName
      .trim()
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-\s]/g, "")
      .trim() || "Resume";

  const bytes = generateResumePdfBytes(resume);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
