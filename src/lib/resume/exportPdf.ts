import { reconstructLatexResume } from "./latex";
import {
  DEFAULT_RESUME_FORMAT,
  hasResumeSection,
  type MasterResume,
  type ResumeFormat,
  type ResumeSectionKey,
} from "./types";
import { parseMarkup } from "./utils";

type FontVariant = "regular" | "bold" | "italic" | "boldItalic";
type VectorIconKind = "pin" | "phone" | "mail" | "linkedin" | "github" | "globe" | "link";

interface StyledSpan {
  text: string;
  font: FontVariant;
  gray?: number;
  underline?: boolean;
  linkUrl?: string;
  iconBefore?: VectorIconKind;
  iconAfter?: VectorIconKind;
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
 * Standard Adobe AFM character widths (1/1000 em) for Helvetica (Regular & Bold).
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
      out += "\\225";
    } else if (ch === "–") {
      out += "\\226";
    } else if (ch === "—") {
      out += "\\227";
    } else if (ch === "·") {
      out += "\\267";
    } else if (ch === "×") {
      out += "\\327";
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
 * Draw compact vector icons matching FontAwesome 5 resume glyphs (\faLink, \faGithub, \faMapMarker*, etc.)
 * for the offline fallback PDF renderer.
 */
function drawVectorIcon(
  ops: string[],
  kind: VectorIconKind,
  x: number,
  y: number,
  sizePt: number,
  gray = 0.08
): number {
  const s = sizePt * 0.78;
  const by = y + sizePt * 0.04;
  ops.push(`q ${num(gray)} G ${num(gray)} g 0.75 w 1 J 1 j`);

  if (kind === "link") {
    // Chain link icon (\faLink)
    const r = s * 0.22;
    ops.push(
      `${num(x + s * 0.12)} ${num(by + s * 0.15)} ${num(s * 0.42)} ${num(r * 1.4)} re S`,
      `${num(x + s * 0.42)} ${num(by + s * 0.45)} ${num(s * 0.42)} ${num(r * 1.4)} re S`,
      `${num(x + s * 0.32)} ${num(by + s * 0.32)} m ${num(x + s * 0.62)} ${num(by + s * 0.58)} l S`
    );
  } else if (kind === "github") {
    // GitHub mark silhouette (\faGithub)
    const cx = x + s * 0.48;
    const cy = by + s * 0.48;
    const r = s * 0.42;
    const k = r * 0.552;
    ops.push(
      `${num(cx)} ${num(cy + r)} m ` +
        `${num(cx + k)} ${num(cy + r)} ${num(cx + r)} ${num(cy + k)} ${num(cx + r)} ${num(cy)} c ` +
        `${num(cx + r)} ${num(cy - k)} ${num(cx + k)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c ` +
        `${num(cx - k)} ${num(cy - r)} ${num(cx - r)} ${num(cy - k)} ${num(cx - r)} ${num(cy)} c ` +
        `${num(cx - r)} ${num(cy + k)} ${num(cx - k)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c f`,
      `1 g ${num(cx - r * 0.45)} ${num(cy - r * 0.15)} ${num(r * 0.9)} ${num(r * 0.55)} re f`
    );
  } else if (kind === "pin") {
    const cx = x + s * 0.42;
    const cy = by + s * 0.62;
    const r = s * 0.28;
    ops.push(
      `${num(cx - r)} ${num(cy)} m ${num(cx)} ${num(by + 0.5)} l ${num(cx + r)} ${num(cy)} l f`,
      `${num(cx - r)} ${num(cy - r * 0.5)} ${num(r * 2)} ${num(r * 1.2)} re f`
    );
  } else if (kind === "mail") {
    const w = s * 0.92;
    const h = s * 0.64;
    ops.push(
      `${num(x)} ${num(by + s * 0.12)} ${num(w)} ${num(h)} re S`,
      `${num(x)} ${num(by + s * 0.12 + h)} m ${num(x + w / 2)} ${num(by + s * 0.12 + h * 0.35)} l ${num(
        x + w
      )} ${num(by + s * 0.12 + h)} l S`
    );
  } else if (kind === "phone") {
    ops.push(
      `${num(x + s * 0.15)} ${num(by + s * 0.78)} m ${num(x + s * 0.35)} ${num(by + s * 0.42)} l ${num(
        x + s * 0.75
      )} ${num(by + s * 0.12)} l S`
    );
  } else if (kind === "linkedin") {
    const w = s * 0.85;
    ops.push(`${num(x)} ${num(by + s * 0.08)} ${num(w)} ${num(w)} re S`);
  } else if (kind === "globe") {
    const w = s * 0.82;
    ops.push(
      `${num(x + w * 0.05)} ${num(by + s * 0.08)} ${num(w)} ${num(w)} re S`,
      `${num(x + w * 0.05)} ${num(by + s * 0.08 + w / 2)} m ${num(x + w * 1.05)} ${num(
        by + s * 0.08 + w / 2
      )} l S`
    );
  }

  ops.push("Q");
  return s + 2.5;
}

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
 * Fallback client-side vector PDF 1.4 generator if offline.
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
    linkUrl?: string,
    iconBefore?: VectorIconKind,
    iconAfter?: VectorIconKind
  ): number => {
    let curX = x;
    const startX = x;
    if (iconBefore) {
      curX += drawVectorIcon(curPage.ops, iconBefore, curX, y, sizePt, gray);
    }
    if (text) {
      const w = measureTextPt(text, font, sizePt);
      curPage.ops.push(
        `BT ${num(gray)} g ${fontResourceName(font)} ${num(sizePt)} Tf ${num(curX)} ${num(
          y
        )} Td ${toPdfLiteralString(text)} Tj ET`
      );
      if (underline) {
        const uy = y - 1.5;
        curPage.ops.push(
          `${num(gray)} G 0.45 w ${num(curX)} ${num(uy)} m ${num(curX + w)} ${num(uy)} l S`
        );
      }
      curX += w;
    }
    if (iconAfter) {
      curX += 2.5;
      curX += drawVectorIcon(curPage.ops, iconAfter, curX, y, sizePt, gray);
    }
    const totalW = curX - startX;
    if (linkUrl && totalW > 0) {
      const fullUrl =
        linkUrl.startsWith("http") || linkUrl.startsWith("mailto:")
          ? linkUrl
          : `https://${linkUrl}`;
      curPage.links.push({
        x: startX,
        y: y - 2,
        w: totalW,
        h: sizePt + 3,
        url: fullUrl,
      });
    }
    return totalW;
  };

  const drawTokenLine = (tokens: WordToken[], startX: number, y: number, sizePt: number) => {
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

    const contactItems: StyledSpan[] = [];
    if (contact.location) {
      contactItems.push({
        text: contact.location,
        font: "regular",
        gray: bodyGray,
        iconBefore: fmt.headerStyle.showIcons ? "pin" : undefined,
      });
    }
    if (contact.phone) {
      contactItems.push({
        text: contact.phone,
        font: "regular",
        gray: bodyGray,
        iconBefore: fmt.headerStyle.showIcons ? "phone" : undefined,
      });
    }
    if (contact.email) {
      contactItems.push({
        text: contact.email,
        font: "regular",
        gray: bodyGray,
        underline: fmt.headerStyle.underlineLinks,
        linkUrl: `mailto:${contact.email}`,
        iconBefore: fmt.headerStyle.showIcons ? "mail" : undefined,
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
        iconBefore: fmt.headerStyle.showIcons
          ? link.kind === "linkedin"
            ? "linkedin"
            : link.kind === "github"
            ? "github"
            : "globe"
          : undefined,
      });
    }

    if (contactItems.length > 0) {
      const contactPt = smallPt;
      ensureSpace(contactPt * lineFactor);
      cursorY -= contactPt * lineFactor;

      const sepText = fmt.headerStyle.separator === "bar" ? "  |  " : "  ·  ";
      const sepW = measureTextPt(sepText, "regular", contactPt);
      const iconExtra = fmt.headerStyle.showIcons ? contactPt * 0.78 + 2.5 : 0;
      const totalLineW = contactItems.reduce(
        (acc, item, idx) =>
          acc +
          (idx > 0 ? sepW : 0) +
          measureTextPt(item.text, item.font, contactPt) +
          (item.iconBefore ? iconExtra : 0),
        0
      );

      let cx =
        fmt.headerStyle.alignment === "center"
          ? marginLeft + Math.max(0, (contentWidth - totalLineW) / 2)
          : marginLeft;

      contactItems.forEach((item, idx) => {
        if (idx > 0) {
          cx += drawTextSpan(sepText, cx, cursorY, "regular", contactPt, mutedGray);
        }
        cx += drawTextSpan(
          item.text,
          cx,
          cursorY,
          item.font,
          contactPt,
          item.gray,
          item.underline,
          item.linkUrl,
          item.iconBefore
        );
      });
      cursorY -= 4;
    }
  }

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

    cursorY -= row1Pt * lineFactor;
    let x1 = marginLeft;
    for (const sp of line1Left) {
      x1 += drawTextSpan(
        sp.text,
        x1,
        cursorY,
        sp.font,
        row1Pt,
        sp.gray ?? bodyGray,
        sp.underline,
        sp.linkUrl,
        sp.iconBefore,
        sp.iconAfter
      );
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

    cursorY -= row2Pt * 1.15;
    let x2 = marginLeft;
    for (const sp of line2Left) {
      x2 += drawTextSpan(
        sp.text,
        x2,
        cursorY,
        sp.font,
        row2Pt,
        sp.gray ?? bodyGray,
        sp.underline,
        sp.linkUrl,
        sp.iconBefore,
        sp.iconAfter
      );
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
        if (edu.bullets && edu.bullets.length > 0) {
          drawBullets(edu.bullets);
        }
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
          linkUrl: job.companyUrl || undefined,
          iconAfter:
            job.companyUrl && fmt.entryStyle.showLinkIcons ? "link" : undefined,
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
            linkUrl: proj.url || undefined,
            iconAfter:
              proj.url && fmt.entryStyle.showLinkIcons
                ? proj.linkIcon === "\\faLink"
                  ? "link"
                  : "github"
                : undefined,
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
            sp.linkUrl,
            sp.iconBefore,
            sp.iconAfter
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

  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  addObj("");
  addObj("");

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
 * Compiles the reconstructed LaTeX document via TeX Live (`pdflatex` / `lualatex`)
 * and returns a Blob URL suitable for in-screen `<iframe src={blobUrl} />` visualization
 * (without triggering a browser file download). Falls back to the local vector PDF generator if offline.
 */
export async function compileResumePdfBlobUrl(resume: MasterResume): Promise<string> {
  const latexSource = reconstructLatexResume(resume);
  let pdfBytes: Uint8Array | null = null;

  try {
    const res = await fetch("/api/resume/compile-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: latexSource }),
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const arr = new Uint8Array(buf);
      if (arr.length > 4 && arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46) {
        pdfBytes = arr;
      }
    }
  } catch (e) {
    console.warn("TeX Live compilation unavailable, using local vector PDF generator:", e);
  }

  if (!pdfBytes) {
    pdfBytes = generateResumePdfBytes(resume);
  }

  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

/**
 * Compiles the reconstructed LaTeX document via TeX Live (`pdflatex` / `lualatex`)
 * for a 100% identical LaTeX PDF (with FontAwesome 5 icons, exact spacing, margins, and fonts),
 * falling back to the client-side vector PDF generator only if offline.
 */
export async function downloadResumePdf(resume: MasterResume, rawName: string): Promise<void> {
  const cleanName =
    rawName
      .trim()
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-\s]/g, "")
      .trim() || "Resume";

  const latexSource = reconstructLatexResume(resume);
  let pdfBytes: Uint8Array | null = null;

  try {
    const res = await fetch("/api/resume/compile-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: latexSource }),
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const arr = new Uint8Array(buf);
      if (arr.length > 4 && arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46) {
        pdfBytes = arr;
      }
    }
  } catch (e) {
    console.warn("TeX Live compilation unavailable, using local vector PDF generator:", e);
  }

  if (!pdfBytes) {
    pdfBytes = generateResumePdfBytes(resume);
  }

  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Download the reconstructed `.tex` file with all current edits and ordering.
 */
export function downloadResumeTex(resume: MasterResume, rawName: string): void {
  const cleanName =
    rawName
      .trim()
      .replace(/\.(pdf|tex)$/i, "")
      .replace(/[^a-zA-Z0-9._-\s]/g, "")
      .trim() || "Resume";

  const latexSource = reconstructLatexResume(resume);
  const blob = new Blob([latexSource], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanName}.tex`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
