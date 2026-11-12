import type {
  Award,
  Contact,
  ContactLink,
  Education,
  Job,
  MasterResume,
  Project,
  ResumeFormat,
  ResumeSectionKey,
  SkillCategory,
} from "./types";
import { DEFAULT_RESUME_FORMAT, emptyResume } from "./types";
import { analyzeBullet, knownTools, plainText, splitItems, uid } from "./utils";

/* ---------------------------------- low level ---------------------------------- */

export function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => line.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");
}

/** Read a balanced `{...}` or `[...]` group starting at or after `from`. */
export function readGroup(s: string, from: number): { content: string; end: number } | null {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== "{" && s[i] !== "[") return null;
  const openChar = s[i];
  const closeChar = openChar === "{" ? "}" : "]";
  const start = i + 1;
  let depth = 0;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return { content: s.slice(start, i), end: i + 1 };
    }
  }
  return null;
}

export function readGroups(s: string, from: number, count: number) {
  const args: string[] = [];
  let idx = from;
  for (let k = 0; k < count; k++) {
    const g = readGroup(s, idx);
    if (!g) break;
    args.push(g.content);
    idx = g.end;
  }
  return { args, end: idx };
}

function replaceCmd(
  s: string,
  name: string,
  argc: number,
  fn: (args: string[]) => string
): string {
  const re = new RegExp("\\\\" + name + "(?![A-Za-z])", "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const { args, end } = readGroups(s, m.index + m[0].length, argc);
    if (args.length < argc) continue;
    out += s.slice(last, m.index) + fn(args);
    last = end;
    re.lastIndex = end;
  }
  return out + s.slice(last);
}

function firstHref(raw?: string): { url: string; text: string } | null {
  if (!raw) return null;
  const m = /\\href(?![A-Za-z])/.exec(raw);
  if (!m) return null;
  const { args } = readGroups(raw, m.index + m[0].length, 2);
  if (args.length < 2) return null;
  return { url: args[0].trim(), text: args[1] };
}

/**
 * Convert a LaTeX fragment to readable text with preserved `**bold**` markup.
 */
export function toMarkup(raw: string): string {
  if (!raw) return "";
  let s = raw;
  for (const cmd of [
    "vspace",
    "hspace",
    "begin",
    "end",
    "par",
    "noindent",
    "pagestyle",
    "setlength",
    "setlist",
  ]) {
    s = replaceCmd(s, cmd, 1, () => "");
  }
  s = replaceCmd(s, "href", 2, (a) => a[1]);
  s = replaceCmd(s, "underline", 1, (a) => a[0]);
  s = replaceCmd(s, "textit", 1, (a) => a[0]);
  s = replaceCmd(s, "emph", 1, (a) => a[0]);
  s = replaceCmd(s, "textcolor", 2, (a) => a[1]);
  s = replaceCmd(s, "small", 1, (a) => a[0]);
  s = replaceCmd(s, "MakeUppercase", 1, (a) => a[0]);
  s = replaceCmd(s, "MakeLowercase", 1, (a) => a[0]);

  s = s.replace(
    /\\(?:Huge|huge|LARGE|Large|large|small|footnotesize|tiny|normalsize)(?![A-Za-z])/g,
    ""
  );
  s = s.replace(/\\fa[A-Za-z0-9]+\*?/g, "");

  for (let pass = 0; pass < 4; pass++) {
    s = replaceCmd(s, "textbf", 1, (a) => "**" + replaceCmd(a[0], "textbf", 1, (b) => b[0]) + "**");
  }

  s = s.replace(/(?<!\\)~/g, " ");
  s = s
    .replace(/\$\\sim\$/g, "~")
    .replace(/\$\\cdot\$/g, "·")
    .replace(/\$\|\$/g, "|")
    .replace(/\$\\times\$/g, "×")
    .replace(/\$\\approx\$/g, "≈")
    .replace(/\$\\bullet\$/g, "•")
    .replace(/\\cdot/g, "·");
  s = s
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#");
  s = s.replace(/---/g, "—").replace(/--/g, "–");
  s = s.replace(/\\hfill/g, " ");
  s = s.replace(/\\\\/g, "\n").replace(/\\ /g, " ");
  s = s.replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}]/g, "");
  s = s.replace(/\*\*\s*\*\*/g, "");
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export const toPlain = (raw: string) => plainText(toMarkup(raw)).trim();

function splitDates(dates: string): string {
  return dates.replace(/\s*[–—-]+\s*/g, " – ").trim();
}

/* ---------------------------------- dimensions --------------------------------- */

function dimToInches(raw: string, baseFontPt = 11): number | null {
  const m = /([+-]?\d+(?:\.\d+)?)\s*(in|cm|mm|pt|em)/i.exec(raw.trim());
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "in") return val;
  if (unit === "cm") return val / 2.54;
  if (unit === "mm") return val / 25.4;
  if (unit === "pt") return val / 72;
  if (unit === "em") return (val * baseFontPt) / 72;
  return null;
}

function dimToPoints(raw: string, baseFontPt = 11): number | null {
  const inches = dimToInches(raw, baseFontPt);
  return inches !== null ? inches * 72 : null;
}

/* ----------------------------------- sections ---------------------------------- */

interface SectionRegion {
  name: string;
  key: string;
  start: number;
  contentStart: number;
  end: number;
}

/**
 * Universal section heading finder.
 * Matches standard LaTeX section macros (\section, \ressection, \cvsection, \rSection, \heading)
 * while excluding entry-level macros such as \resumeSubheading or \resumeProjectHeading.
 */
function findSections(body: string): SectionRegion[] {
  const sections: SectionRegion[] = [];
  const secRe = /\\(?:(?:res|cv|r|my)?section\*?|(?<!sub)heading\*?)(?![A-Za-z])/gi;
  let m: RegExpExecArray | null;
  while ((m = secRe.exec(body))) {
    const after = m.index + m[0].length;
    const g = readGroup(body, after);
    if (!g) continue;
    const rawName = toPlain(g.content);
    if (!rawName) continue;
    sections.push({
      name: rawName,
      key: rawName.toUpperCase(),
      start: m.index,
      contentStart: g.end,
      end: body.length,
    });
  }

  for (let i = 0; i < sections.length; i++) {
    sections[i].end = i + 1 < sections.length ? sections[i + 1].start : body.length;
  }
  return sections;
}

function classifySectionKey(upperName: string): ResumeSectionKey | null {
  if (/EDUCAT|ACADEMIC/.test(upperName)) return "education";
  if (/SKILL|TECHNICAL|COMPETENC/.test(upperName)) return "skills";
  if (/EXPERIENCE|WORK|EMPLOYMENT|PROFESSIONAL|LEADERSHIP|EXTRACURRICULAR|ACTIVIT|VOLUNTEER/.test(upperName))
    return "experience";
  if (/PROJECT/.test(upperName)) return "projects";
  if (/AWARD|HONOR|SCHOLARSHIP|ACHIEVEMENT/.test(upperName)) return "awards";
  return null;
}

/** Extract formatting metadata from the LaTeX document preamble and body. */
function parseResumeFormat(
  src: string,
  preamble: string,
  headerRegion: string,
  sections: SectionRegion[]
): ResumeFormat {
  const fmt: ResumeFormat = structuredClone(DEFAULT_RESUME_FORMAT);

  // 1. Document class: paperSize & baseFontSizePt
  const docClassMatch = /\\documentclass\s*(?:\[([^\]]*)\])?/.exec(preamble);
  if (docClassMatch && docClassMatch[1]) {
    const opts = docClassMatch[1];
    if (/a4paper/i.test(opts)) fmt.paperSize = "a4";
    else if (/letterpaper/i.test(opts)) fmt.paperSize = "letter";

    const ptMatch = /(10|11|12)pt/.exec(opts);
    if (ptMatch) fmt.baseFontSizePt = Number(ptMatch[1]) as 10 | 11 | 12;
  }

  // 2. Font family & scale
  const helvetMatch = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{helvet\}/.exec(preamble);
  if (helvetMatch) {
    fmt.fontFamily = "helvetica";
    const scaleMatch = /scaled\s*=\s*(\d+(?:\.\d+)?)/.exec(helvetMatch[1] || "");
    fmt.fontScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1.0;
  } else if (/Noto\s*Sans/i.test(preamble)) {
    fmt.fontFamily = "noto-sans";
    fmt.fontScale = 1.0;
  } else if (/\\sfdefault|sans|roboto|lato|opensans|inter|arial|tgheros/i.test(preamble)) {
    fmt.fontFamily = "sans";
    fmt.fontScale = 1.0;
  } else {
    fmt.fontFamily = "serif";
    fmt.fontScale = 1.0;
  }

  // 3. Margins: geometry package vs fullpage + \addtolength
  const geoPkgMatch = /\\usepackage\s*\[([^\]]+)\]\s*\{geometry\}/.exec(preamble);
  const geoCmdMatch = /\\geometry\s*\{([^}]+)\}/.exec(preamble);
  const geoOpts = geoPkgMatch?.[1] || geoCmdMatch?.[1] || "";

  if (geoOpts) {
    if (/a4paper/i.test(geoOpts)) fmt.paperSize = "a4";
    if (/letterpaper/i.test(geoOpts)) fmt.paperSize = "letter";

    const allMargin = /(?:^|,)\s*margin\s*=\s*([^,\]]+)/i.exec(geoOpts);
    if (allMargin) {
      const m = dimToInches(allMargin[1], fmt.baseFontSizePt);
      if (m !== null) {
        fmt.margins = { topIn: m, bottomIn: m, leftIn: m, rightIn: m };
      }
    }
    const hMargin = /hmargin\s*=\s*([^,\]]+)/i.exec(geoOpts);
    if (hMargin) {
      const m = dimToInches(hMargin[1], fmt.baseFontSizePt);
      if (m !== null) {
        fmt.margins.leftIn = m;
        fmt.margins.rightIn = m;
      }
    }
    const vMargin = /vmargin\s*=\s*([^,\]]+)/i.exec(geoOpts);
    if (vMargin) {
      const m = dimToInches(vMargin[1], fmt.baseFontSizePt);
      if (m !== null) {
        fmt.margins.topIn = m;
        fmt.margins.bottomIn = m;
      }
    }
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const sideMatch = new RegExp(`(?:^|,)\\s*${side}\\s*=\\s*([^,\\]]+)`, "i").exec(geoOpts);
      if (sideMatch) {
        const m = dimToInches(sideMatch[1], fmt.baseFontSizePt);
        if (m !== null) {
          if (side === "top") fmt.margins.topIn = m;
          if (side === "bottom") fmt.margins.bottomIn = m;
          if (side === "left") fmt.margins.leftIn = m;
          if (side === "right") fmt.margins.rightIn = m;
        }
      }
    }
  } else if (/\\usepackage(?:\[[^\]]*\])?\{fullpage\}/.test(preamble)) {
    let leftIn = 1.0;
    let rightIn = 1.0;
    let topIn = 1.0;
    let bottomIn = 1.0;

    const oddMatch = /\\addtolength\{\\oddsidemargin\}\{([^}]+)\}/.exec(preamble);
    if (oddMatch) {
      const delta = dimToInches(oddMatch[1], fmt.baseFontSizePt);
      if (delta !== null) {
        leftIn = Math.max(0.2, 1.0 + delta);
        rightIn = leftIn;
      }
    }
    const topMatch = /\\addtolength\{\\topmargin\}\{([^}]+)\}/.exec(preamble);
    if (topMatch) {
      const delta = dimToInches(topMatch[1], fmt.baseFontSizePt);
      if (delta !== null) {
        topIn = Math.max(0.2, 1.0 + delta);
        bottomIn = topIn;
      }
    }
    fmt.margins = { topIn, bottomIn, leftIn, rightIn };
  }

  // 4. Line spread & muted color
  const lsMatch = /\\linespread\{(\d+(?:\.\d+)?)\}/.exec(preamble);
  fmt.lineSpread = lsMatch ? parseFloat(lsMatch[1]) : 1.0;

  const mutedMatch = /\\definecolor\{muted\}\{gray\}\{(\d+(?:\.\d+)?)\}/.exec(preamble);
  fmt.mutedGray = mutedMatch ? parseFloat(mutedMatch[1]) : 0.35;

  // 5. Header style
  fmt.headerStyle.alignment = /\\begin\{center\}/.test(headerRegion) ? "center" : "left";
  if (/\\Huge/.test(headerRegion)) fmt.headerStyle.nameSize = "Huge";
  else if (/\\LARGE/.test(headerRegion)) fmt.headerStyle.nameSize = "LARGE";
  else fmt.headerStyle.nameSize = "Large";

  fmt.headerStyle.nameBold = /\\textbf|\\bfseries/.test(headerRegion);
  fmt.headerStyle.showIcons = /\\fa(?:MapMarker|Phone|Envelope|Linkedin|Github|Globe)/.test(
    headerRegion
  );
  fmt.headerStyle.underlineLinks = /\\underline\{/.test(headerRegion);
  if (/\$\\cdot\$|\\cdot/.test(headerRegion)) fmt.headerStyle.separator = "cdot";
  else if (/\$\|\$|\|/.test(headerRegion)) fmt.headerStyle.separator = "bar";
  else fmt.headerStyle.separator = "cdot";

  // 6. Section heading style
  fmt.sectionStyle.uppercase = /\\MakeUppercase|\\uppercase|\\scshape/.test(preamble);
  fmt.sectionStyle.hasRule = /\\titlerule|\\hrule/.test(preamble);
  const hruleHeight = /\\hrule\s+height\s+([0-9.]+pt)/.exec(preamble);
  if (hruleHeight) {
    fmt.sectionStyle.ruleHeightPt = parseFloat(hruleHeight[1]) || 0.6;
  } else {
    fmt.sectionStyle.ruleHeightPt = 0.5;
  }

  const titleSpacingMatch =
    /\\titlespacing\*?\{\\section\}\{[^}]*\}\{([^}]+)\}\{([^}]+)\}/.exec(preamble);
  if (titleSpacingMatch) {
    const above = dimToPoints(titleSpacingMatch[1], fmt.baseFontSizePt);
    const below = dimToPoints(titleSpacingMatch[2], fmt.baseFontSizePt);
    if (above !== null) fmt.sectionStyle.spaceAbovePt = above;
    if (below !== null) fmt.sectionStyle.spaceBelowPt = below;
  } else if (/\\newcommand\{\\ressection\}/.test(preamble)) {
    fmt.sectionStyle.spaceAbovePt = 8;
    fmt.sectionStyle.spaceBelowPt = 5;
  }

  const orderedKeys: ResumeSectionKey[] = [];
  const sectionTitles: Partial<Record<ResumeSectionKey, string>> = {};
  for (const sec of sections) {
    const k = classifySectionKey(sec.key);
    if (k) {
      if (!orderedKeys.includes(k)) {
        orderedKeys.push(k);
      }
      if (!sectionTitles[k]) {
        sectionTitles[k] = sec.name;
      }
    }
  }
  if (orderedKeys.length > 0) {
    fmt.sectionStyle.order = orderedKeys;
  }
  fmt.sectionStyle.titles = {
    ...fmt.sectionStyle.titles,
    ...sectionTitles,
  };

  // 7. Entry / Subheading style
  const hasResumeSubheading = /\\resumeSubheading/.test(src);
  if (hasResumeSubheading) {
    fmt.entryStyle = {
      layout: "subheading-macro",
      companyFirst: false,
      line2Bold: false,
      rightItalic: false,
      rightMuted: /\\textcolor\{muted\}/.test(src),
      showLinkIcons: /\\faLink|\\faGithub/.test(src),
      projectTechStyle: /\\textcolor\{muted\}/.test(src) ? "muted" : "italic",
      entrySpacingPt: 4,
    };
  } else {
    fmt.entryStyle = {
      layout: "hfill-italic",
      companyFirst: true,
      line2Bold: true,
      rightItalic: /\\hfill\s*\\textit/.test(src),
      rightMuted: /\\textcolor\{muted\}/.test(src),
      showLinkIcons: /\\faLink|\\faGithub/.test(src),
      projectTechStyle: /\$\|\$\s*\\textit/.test(src) ? "italic" : "muted",
      entrySpacingPt: 5,
    };
  }

  // 8. Skill style
  const skillsSec = sections.find((s) => /SKILL|TECHNICAL|COMPETENC/.test(s.key));
  if (skillsSec) {
    const skillBody = src.slice(skillsSec.contentStart, skillsSec.end);
    const itemCount = (skillBody.match(/\\item(?![A-Za-z])/g) || []).length;
    fmt.skillStyle.layout = itemCount > 1 ? "itemize-bullets" : "compact-lines";
    fmt.skillStyle.colonInsideBold = /\\textbf\{[^}]+:\}/.test(skillBody);
    fmt.skillStyle.smallText = /\\small/.test(skillBody);
  }

  // 9. Bullet style
  const hasResumeItem = /\\resumeItem/.test(src);
  fmt.bulletStyle.smallText = hasResumeItem || /\\newcommand\{\\resumeItem\}\[1\]\{\\item\\small/.test(preamble);

  const leftMarginMatch = /leftmargin\s*=\s*([^,\]]+)/.exec(src);
  if (leftMarginMatch) {
    const lm = dimToInches(leftMarginMatch[1], fmt.baseFontSizePt);
    if (lm !== null) fmt.bulletStyle.leftMarginIn = lm;
  }
  if (/nosep/.test(preamble)) {
    fmt.bulletStyle.itemSepPt = 1;
  } else {
    const itemSepMatch = /itemsep\s*=\s*([^,\]]+)/.exec(src);
    if (itemSepMatch) {
      const isep = dimToPoints(itemSepMatch[1], fmt.baseFontSizePt);
      if (isep !== null) fmt.bulletStyle.itemSepPt = Math.max(0, isep);
    }
  }
  const topSepMatch = /topsep\s*=\s*([^,\]]+)/.exec(src);
  if (topSepMatch) {
    const tsep = dimToPoints(topSepMatch[1], fmt.baseFontSizePt);
    if (tsep !== null) fmt.bulletStyle.topSepPt = Math.max(0, tsep);
  }

  return fmt;
}

/** Extract Candidate Contact Info from header / preamble region. */
function parseContact(headerRegion: string): Contact {
  const contact: Contact = { name: "", location: "", phone: "", email: "", links: [] };

  // 1. Detect Name
  const tbRe = /\\textbf\s*\{([^}]+)\}/g;
  let tb: RegExpExecArray | null;
  while ((tb = tbRe.exec(headerRegion))) {
    const clean = toPlain(tb[1]);
    if (clean && clean.length > 2 && !/@/.test(clean) && !/\d{3}/.test(clean) && !contact.name) {
      contact.name = clean;
      break;
    }
  }

  if (!contact.name) {
    const lines = headerRegion.split(/\n|\\\\/).map(toPlain).filter(Boolean);
    if (lines.length > 0) contact.name = lines[0];
  }

  // 2. Detect Email
  const emailMatch = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/.exec(headerRegion);
  if (emailMatch) contact.email = emailMatch[1];

  // 3. Detect Phone
  const phoneMatch = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.exec(headerRegion);
  if (phoneMatch) contact.phone = phoneMatch[0].trim();

  // 4. Detect Explicit \href Links
  const hrefRe = /\\href\s*\{([^}]+)\}\s*\{([^}]+)\}/g;
  let hm: RegExpExecArray | null;
  const seenUrls = new Set<string>();
  while ((hm = hrefRe.exec(headerRegion))) {
    const url = hm[1].trim();
    const label = toPlain(hm[2]) || url;
    if (url.startsWith("mailto:")) continue;
    seenUrls.add(url);
    let kind: ContactLink["kind"] = "other";
    if (/linkedin\.com/i.test(url)) kind = "linkedin";
    else if (/github\.com/i.test(url)) kind = "github";
    else if (
      /^[a-zA-Z0-9.-]+\.(?:io|ca|com|org|dev|me)/i.test(label) ||
      /portfolio|website/i.test(label)
    )
      kind = "website";
    contact.links.push({ id: uid("l"), kind, label, url });
  }

  // 5. Detect Plain URLs without \href
  const sanitizedForLinks = headerRegion.replace(/\\href\{mailto:[^}]+\}\{[^}]+\}/g, "");
  const plainLinks =
    sanitizedForLinks.match(
      /(?:github\.com\/[a-zA-Z0-9_.-]+|linkedin\.com\/in\/[a-zA-Z0-9_.-]+|[a-zA-Z0-9_-]+\.(?:io|ca|com|org|dev|me)\b[^\s\\$]*)/gi
    ) || [];
  for (const raw of plainLinks) {
    const clean = raw.trim();
    if (Array.from(seenUrls).some((u) => u.includes(clean))) continue;
    let kind: ContactLink["kind"] = "other";
    const url = clean.startsWith("http") ? clean : "https://" + clean;
    if (/linkedin\.com/i.test(clean)) kind = "linkedin";
    else if (/github\.com/i.test(clean)) kind = "github";
    else kind = "website";
    seenUrls.add(url);
    contact.links.push({ id: uid("l"), kind, label: clean, url });
  }

  // 6. Detect Location
  const locMatch = /([A-Za-z\s]+,\s*[A-Z]{2}(?:\s*\([^)]+\))?)/.exec(headerRegion);
  if (locMatch && !locMatch[1].includes("@")) {
    contact.location = toPlain(locMatch[1]).replace(/^(?:small|large|huge)\s*/i, "");
  }

  return contact;
}

/** Extract bullets supporting \resumeItem{...} and standard \item environments. */
function extractBullets(rawBlock: string): { id: string; text: string; tools: string[]; metrics: string[] }[] {
  const bullets: { id: string; text: string; tools: string[]; metrics: string[] }[] = [];

  // Style A: \resumeItem{...}
  const riRe = /\\resumeItem\s*\{/g;
  let rm: RegExpExecArray | null;
  let hasResumeItem = false;
  while ((rm = riRe.exec(rawBlock))) {
    hasResumeItem = true;
    const g = readGroup(rawBlock, rm.index + rm[0].length - 1);
    if (g) {
      const text = toMarkup(g.content);
      if (text) bullets.push({ id: uid("b"), text, tools: [], metrics: [] });
    }
  }

  if (hasResumeItem) return bullets;

  // Style B: \begin{itemize} ... \item ... \end{itemize} or raw \item
  const itemRe =
    /\\item(?![A-Za-z])(?:\[[^\]]*\])?\s*([\s\S]*?)(?=(?:\\item(?![A-Za-z])|\\end\{itemize\}|\\end\{enumerate\}|$))/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(rawBlock))) {
    let content = im[1].trim();
    content = content.replace(/\\begin\{itemize\}|\\end\{itemize\}/g, "").trim();
    const text = toMarkup(content);
    if (text) {
      bullets.push({ id: uid("b"), text, tools: [], metrics: [] });
    }
  }
  return bullets;
}

/** Parse Skills across all list, macro, and tabular formats. */
function parseSkills(content: string): SkillCategory[] {
  const categories: SkillCategory[] = [];
  const itemBlocks = content.split(/\\item(?![A-Za-z])|\\\\/).filter((b) => b.trim());

  for (const block of itemBlocks) {
    const tb = /\\textbf\s*\{([^}]+)\}/.exec(block);
    if (!tb) continue;
    const rawCatName = toPlain(tb[1]).replace(/[:&]/g, "").trim();
    if (!rawCatName || rawCatName.length < 2) continue;

    const after = block.slice(tb.index + tb[0].length);
    const cleanList = toPlain(after).replace(/^[:\s&{}]+/, "").trim();
    const skills = splitItems(cleanList);
    if (skills.length > 0) {
      categories.push({
        id: uid("c"),
        name: rawCatName,
        skills: skills.map((s) => ({ id: uid("s"), name: s })),
      });
    }
  }

  return categories;
}

/** Parse Education entries across macro and raw LaTeX layouts. */
function parseEducation(content: string): Education[] {
  const educations: Education[] = [];

  // Style A: \resumeSubheading{Inst}{Loc}{Degree}{Dates}
  const subRe = /\\resumeSubheading\s*\{/g;
  let sm: RegExpExecArray | null;
  let hasSubheading = false;
  while ((sm = subRe.exec(content))) {
    hasSubheading = true;
    const { args } = readGroups(content, sm.index + sm[0].length - 1, 4);
    if (args.length >= 4) {
      educations.push({
        id: uid("e"),
        institution: toPlain(args[0]),
        location: toPlain(args[1]),
        degree: toPlain(args[2]),
        dates: toPlain(args[3]),
      });
    }
  }
  if (hasSubheading) return educations;

  // Style B: Raw LaTeX (Institution \hfill Location \\ Degree \hfill Dates)
  const itemizeIdx = content.indexOf("\\begin{itemize}");
  const headerPart = itemizeIdx >= 0 ? content.slice(0, itemizeIdx) : content;

  const lines = headerPart
    .split(/\\\\|\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("\\begin") && !l.startsWith("\\end") && !l.startsWith("\\hrule"));

  if (lines.length >= 2) {
    const l1 = lines[0].split(/\\hfill|&/).map(toPlain);
    const l2 = lines[1].split(/\\hfill|&/).map(toPlain);
    if (l1[0] && l2[0]) {
      educations.push({
        id: uid("e"),
        institution: l1[0],
        location: l1[1] || "",
        degree: l2[0],
        dates: l2[1] || "",
      });
    }
  }
  return educations;
}

/** Parse Experience & Leadership jobs across macro-based and raw LaTeX structures. */
function parseExperience(content: string): Job[] {
  const jobs: Job[] = [];

  // Style A: \resumeSubheading{Title}{Dates}{Company}{Loc}
  const subRe = /\\resumeSubheading\s*\{/g;
  let sm: RegExpExecArray | null;
  const subIndices: number[] = [];
  while ((sm = subRe.exec(content))) {
    subIndices.push(sm.index);
  }

  if (subIndices.length > 0) {
    for (let i = 0; i < subIndices.length; i++) {
      const start = subIndices[i];
      const end = i + 1 < subIndices.length ? subIndices[i + 1] : content.length;
      const block = content.slice(start, end);
      const after = block.indexOf("{");
      const { args } = readGroups(block, after, 4);
      if (args.length >= 4) {
        const href = firstHref(args[2]);
        jobs.push({
          id: uid("j"),
          title: toPlain(args[0]),
          dates: splitDates(toPlain(args[1])),
          company: toPlain(args[2]),
          companyUrl: href?.url ?? "",
          location: toPlain(args[3]),
          bullets: extractBullets(block),
        });
      }
    }
    return jobs;
  }

  // Style B: Raw LaTeX (Company \hfill Loc \\ Role \hfill Dates followed by \begin{itemize})
  const itemizeRe = /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = itemizeRe.exec(content))) {
    const header = content.slice(lastIdx, m.index);
    const bulletsRaw = m[1];
    lastIdx = m.index + m[0].length;

    const lines = header
      .split(/\\\\|\n/)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith("\\vspace") &&
          !l.startsWith("\\hrule") &&
          !l.startsWith("\\par") &&
          !l.startsWith("\\noindent")
      );

    if (lines.length >= 2) {
      const l1 = lines[0].split(/\\hfill/).map(toPlain);
      const l2 = lines[1].split(/\\hfill/).map(toPlain);

      const isLine1Role =
        /intern|engineer|developer|lead|analyst|manager|assistant|director|specialist/i.test(l1[0]);
      const company = isLine1Role ? l2[0] : l1[0];
      const title = isLine1Role ? l1[0] : l2[0];
      const location = isLine1Role ? l2[1] || "" : l1[1] || "";
      const dates = isLine1Role ? l1[1] || "" : l2[1] || "";

      const href = firstHref(lines[0]) || firstHref(lines[1]);

      jobs.push({
        id: uid("j"),
        title,
        company,
        companyUrl: href?.url ?? "",
        location,
        dates: splitDates(dates),
        bullets: extractBullets(bulletsRaw),
      });
    }
  }

  return jobs;
}

/** Parse Projects across \resumeProjectHeading and raw LaTeX formats. */
function parseProjects(content: string): Project[] {
  const projects: Project[] = [];

  // Style A: \resumeProjectHeading{name | tech}{meta}
  const phRe = /\\resumeProjectHeading\s*\{/g;
  let pm: RegExpExecArray | null;
  const phIndices: number[] = [];
  while ((pm = phRe.exec(content))) {
    phIndices.push(pm.index);
  }

  if (phIndices.length > 0) {
    for (let i = 0; i < phIndices.length; i++) {
      const start = phIndices[i];
      const end = i + 1 < phIndices.length ? phIndices[i + 1] : content.length;
      const block = content.slice(start, end);
      const after = block.indexOf("{");
      const { args } = readGroups(block, after, 2);
      if (args.length >= 2) {
        const split = args[0].search(/\$\|\$|\|/);
        const left = split >= 0 ? args[0].slice(0, split) : args[0];
        const right = split >= 0 ? args[0].slice(split) : "";
        const href = firstHref(left);
        projects.push({
          id: uid("p"),
          name: toPlain(left),
          url: href?.url ?? "",
          techStack: splitItems(toPlain(right).replace(/^[|$]+/, "").trim()),
          meta: toPlain(args[1]),
          bullets: extractBullets(block),
        });
      }
    }
    return projects;
  }

  // Style B: Raw LaTeX (\textbf{Name} $|$ Tech \hfill Dates followed by \begin{itemize})
  const itemizeRe = /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = itemizeRe.exec(content))) {
    const header = content.slice(lastIdx, m.index);
    const bulletsRaw = m[1];
    lastIdx = m.index + m[0].length;

    const lines = header
      .split(/\\\\|\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("\\vspace") && !l.startsWith("\\hrule"));

    if (lines.length > 0) {
      const line = lines[0];
      const hfillSplit = line.split(/\\hfill/);
      const leftSide = hfillSplit[0] || "";
      const metaDates = hfillSplit[1] ? toPlain(hfillSplit[1]) : "";

      const barSplit = leftSide.split(/\$\|\$|\|/);
      const namePart = barSplit[0] || "";
      const techPart = barSplit[1] || "";

      const href = firstHref(namePart);
      projects.push({
        id: uid("p"),
        name: toPlain(namePart),
        url: href?.url ?? "",
        techStack: splitItems(toPlain(techPart)),
        meta: splitDates(metaDates),
        bullets: extractBullets(bulletsRaw),
      });
    }
  }

  return projects;
}

/** Parse Scholarships, Awards, and Honors. */
function parseAwards(content: string): Award[] {
  const awards: Award[] = [];
  const itemRe =
    /\\item(?![A-Za-z])(?:\[[^\]]*\])?\s*([\s\S]*?)(?=(?:\\item(?![A-Za-z])|\\end\{itemize\}|\\end\{enumerate\}|$))/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(content))) {
    const block = im[1].trim();
    const lines = block.split(/\\\\/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      const topParts = lines[0].split(/\\hfill/).map(toPlain);
      const title = topParts[0] || "";
      const date = topParts[1] || "";
      const desc = lines.slice(1).map(toPlain).join(" ").trim();
      awards.push({
        id: uid("a"),
        title,
        date: splitDates(date),
        description: desc,
      });
    }
  }
  return awards;
}

/* ------------------------------------ main parser ----------------------------------- */

export function parseLatexResume(source: string): MasterResume {
  const resume = emptyResume();
  resume.rawLatex = source;
  const src = stripComments(source);

  const docStart = src.indexOf("\\begin{document}");
  const preamble = docStart >= 0 ? src.slice(0, docStart) : "";
  const body = docStart >= 0 ? src.slice(docStart + "\\begin{document}".length) : src;

  // Discover all sections
  const sections = findSections(body);

  // Parse header contact information
  const contactRegion = sections.length > 0 ? body.slice(0, sections[0].start) : body;
  resume.contact = parseContact(contactRegion);

  // Extract full formatting metadata from preamble, header, and sections
  resume.format = parseResumeFormat(src, preamble, contactRegion, sections);

  const detected = new Set<ResumeSectionKey>(["contact"]);

  for (const sec of sections) {
    const content = body.slice(sec.contentStart, sec.end);
    const key = sec.key;

    if (/EDUCAT|ACADEMIC/.test(key)) {
      const items = parseEducation(content);
      resume.education.push(...items);
      if (items.length > 0) detected.add("education");
    } else if (/SKILL|TECHNICAL|COMPETENC/.test(key)) {
      const items = parseSkills(content);
      resume.skills.push(...items);
      if (items.length > 0) detected.add("skills");
    } else if (/EXPERIENCE|WORK|EMPLOYMENT|PROFESSIONAL/.test(key)) {
      const items = parseExperience(content);
      resume.experience.push(...items);
      if (items.length > 0) detected.add("experience");
    } else if (/PROJECT/.test(key)) {
      const items = parseProjects(content);
      resume.projects.push(...items);
      if (items.length > 0) detected.add("projects");
    } else if (/LEADERSHIP|EXTRACURRICULAR|ACTIVIT|VOLUNTEER/.test(key)) {
      // Leadership roles are integrated into experience to preserve tool, metric, and line calibration scoring
      const items = parseExperience(content);
      resume.experience.push(...items);
      if (items.length > 0) detected.add("experience");
    } else if (/AWARD|HONOR|SCHOLARSHIP|ACHIEVEMENT/.test(key)) {
      const items = parseAwards(content);
      resume.awards.push(...items);
      if (items.length > 0) detected.add("awards");
    }
  }

  resume.sections = Array.from(detected);

  // Derive tools & metrics across the full vocabulary of skills and projects
  const known = knownTools(
    resume.skills.flatMap((c) => c.skills.map((s) => s.name)),
    resume.projects.map((p) => p.techStack)
  );

  for (const container of [...resume.experience, ...resume.projects]) {
    for (const bullet of container.bullets) {
      Object.assign(bullet, analyzeBullet(bullet.text, known));
    }
  }

  resume.updatedAt = new Date().toISOString();
  return resume;
}

export function isEmptyResume(r: MasterResume): boolean {
  return (
    r.education.length +
      r.skills.length +
      r.experience.length +
      r.projects.length +
      (r.awards?.length || 0) ===
      0 && !r.contact.name
  );
}
