import type {
  Contact,
  ContactLink,
  Education,
  Job,
  MasterResume,
  Project,
  SkillCategory,
} from "./types";
import { emptyResume } from "./types";
import { analyzeBullet, knownTools, plainText, splitItems, uid } from "./utils";

/* ---------------------------------- low level ---------------------------------- */

function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => line.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");
}

/** Read a balanced `{...}` group starting at or after `from`. */
function readGroup(s: string, from: number): { content: string; end: number } | null {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== "{") return null;
  const start = i + 1;
  let depth = 0;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { content: s.slice(start, i), end: i + 1 };
    }
  }
  return null;
}

function readGroups(s: string, from: number, count: number) {
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

function firstHref(raw: string): { url: string; text: string } | null {
  const m = /\\href(?![A-Za-z])/.exec(raw);
  if (!m) return null;
  const { args } = readGroups(raw, m.index + m[0].length, 2);
  if (args.length < 2) return null;
  return { url: args[0].trim(), text: args[1] };
}

/**
 * Convert a LaTeX fragment to readable text. Bold spans are kept as
 * `**bold**` so bullets can be decomposed into tools and metrics later.
 */
export function toMarkup(raw: string): string {
  let s = raw;
  for (const cmd of ["vspace", "hspace", "begin", "end"]) {
    s = replaceCmd(s, cmd, 1, () => "");
  }
  s = replaceCmd(s, "href", 2, (a) => a[1]);
  s = replaceCmd(s, "underline", 1, (a) => a[0]);
  s = replaceCmd(s, "textit", 1, (a) => a[0]);
  s = replaceCmd(s, "emph", 1, (a) => a[0]);
  s = replaceCmd(s, "textcolor", 2, (a) => a[1]);
  s = replaceCmd(s, "small", 1, (a) => a[0]);
  s = s.replace(/\\(?:Huge|huge|LARGE|Large|large|small|footnotesize|tiny|normalsize)(?![A-Za-z])/g, "");
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
    .replace(/\$\\bullet\$/g, "•");
  s = s
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#");
  s = s.replace(/---/g, "—").replace(/--/g, "–");
  s = s.replace(/\\\\/g, " ").replace(/\\ /g, " ");
  s = s.replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}$]/g, "");
  s = s.replace(/\*\*\s*\*\*/g, "");
  return s.replace(/\s+/g, " ").trim();
}

const toPlain = (raw: string) => plainText(toMarkup(raw));

/* ----------------------------------- sections ---------------------------------- */

function parseHeading(raw: string): Contact {
  const contact: Contact = { name: "", location: "", phone: "", email: "", links: [] };

  let rest = raw;
  const tb = /\\textbf(?![A-Za-z])/.exec(raw);
  if (tb) {
    const g = readGroup(raw, tb.index + tb[0].length);
    if (g) {
      contact.name = toPlain(g.content);
      rest = raw.slice(g.end);
    }
  }

  const parts = rest.split(/\$\\cdot\$|\$\\bullet\$|\$\|\$/);
  for (const part of parts) {
    const text = toPlain(part);
    if (!text) continue;
    const href = firstHref(part);
    const link = (kind: ContactLink["kind"]) =>
      contact.links.push({
        id: uid("l"),
        kind,
        label: href ? toPlain(href.text) : text,
        url: href?.url ?? "",
      });

    if (/\\faMapMarker/.test(part)) contact.location = text;
    else if (/\\faPhone/.test(part)) contact.phone = text;
    else if (/\\faEnvelope/.test(part)) contact.email = (href?.url ?? text).replace(/^mailto:/, "");
    else if (/\\faLinkedin/.test(part)) link("linkedin");
    else if (/\\faGithub/.test(part)) link("github");
    else if (/\\faGlobe/.test(part)) link("website");
    else if (href) link("other");
    else if (/@/.test(text) && !contact.email) contact.email = text;
    else if (/\+?\d[\d\s().-]{8,}\d/.test(text) && !contact.phone) contact.phone = text;
    else if (!contact.location) contact.location = text;
  }
  return contact;
}

function parseSkills(region: string): SkillCategory[] {
  const categories: SkillCategory[] = [];
  const re = /\\textbf(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region))) {
    const nameGroup = readGroup(region, m.index + m[0].length);
    if (!nameGroup) continue;

    let rest: string;
    let end = nameGroup.end;
    const listGroup = readGroup(region, nameGroup.end);
    if (listGroup) {
      rest = listGroup.content;
      end = listGroup.end;
    } else {
      const tail = region.slice(nameGroup.end);
      const stop = tail.search(/\\\\|\\textbf|\\end|\\item/);
      rest = stop >= 0 ? tail.slice(0, stop) : tail;
      end = nameGroup.end + rest.length;
    }
    re.lastIndex = end;

    const name = toPlain(nameGroup.content);
    const items = splitItems(toPlain(rest).replace(/^\s*:\s*/, ""));
    if (!name || items.length === 0) continue;
    categories.push({
      id: uid("c"),
      name,
      skills: items.map((n) => ({ id: uid("s"), name: n })),
    });
  }
  return categories;
}

function splitDates(dates: string): string {
  return dates.replace(/\s*[–—-]+\s*/g, " – ");
}

function parseProjectHeading(first: string, meta: string): Project {
  const split = first.search(/\$\|\$/);
  const left = split >= 0 ? first.slice(0, split) : first;
  const right = split >= 0 ? first.slice(split) : "";
  const href = firstHref(left);
  const tb = /\\textbf(?![A-Za-z])/.exec(left);
  let nameRaw = left;
  if (tb) {
    const g = readGroup(left, tb.index + tb[0].length);
    if (g) nameRaw = g.content;
  }
  return {
    id: uid("p"),
    name: toPlain(nameRaw),
    url: href?.url ?? "",
    techStack: splitItems(toPlain(right).replace(/^\s*\|\s*/, "")),
    meta: toPlain(meta),
    bullets: [],
  };
}

/* ------------------------------------ parser ----------------------------------- */

type Container = { kind: "job"; ref: Job } | { kind: "project"; ref: Project } | null;

export function parseLatexResume(source: string): MasterResume {
  const resume = emptyResume();
  const src = stripComments(source);

  const docStart = src.indexOf("\\begin{document}");
  const body = docStart >= 0 ? src.slice(docStart + "\\begin{document}".length) : src;

  // Section index
  const sections: { name: string; start: number; end: number }[] = [];
  const secRe = /\\section(?![A-Za-z])/g;
  let sm: RegExpExecArray | null;
  while ((sm = secRe.exec(body))) {
    const g = readGroup(body, sm.index + sm[0].length);
    if (!g) continue;
    sections.push({ name: toPlain(g.content).toUpperCase(), start: sm.index, end: g.end });
  }

  resume.contact = parseHeading(sections.length ? body.slice(0, sections[0].start) : body);

  const sectionAt = (index: number) => {
    let current = "";
    for (const s of sections) if (s.start < index) current = s.name;
    return current;
  };

  // Skills region: between the skills heading and the next heading.
  sections.forEach((s, i) => {
    if (!/SKILL/.test(s.name)) return;
    const stop = i + 1 < sections.length ? sections[i + 1].start : body.length;
    resume.skills.push(...parseSkills(body.slice(s.end, stop)));
  });

  // Walk structural macros in document order.
  const macroRe = /\\(resumeSubheading|resumeProjectHeading|resumeItem)(?![A-Za-z])/g;
  let current: Container = null;
  let mm: RegExpExecArray | null;
  while ((mm = macroRe.exec(body))) {
    const after = mm.index + mm[0].length;
    const section = sectionAt(mm.index);

    if (mm[1] === "resumeSubheading") {
      const { args, end } = readGroups(body, after, 4);
      if (args.length < 4) continue;
      macroRe.lastIndex = end;

      if (/EDUCAT/.test(section)) {
        const edu: Education = {
          id: uid("e"),
          institution: toPlain(args[0]),
          location: toPlain(args[1]),
          degree: toPlain(args[2]),
          dates: toPlain(args[3]),
        };
        resume.education.push(edu);
        current = null;
      } else {
        const href = firstHref(args[2]);
        const job: Job = {
          id: uid("j"),
          title: toPlain(args[0]),
          dates: splitDates(toPlain(args[1])),
          company: toPlain(args[2]),
          companyUrl: href?.url ?? "",
          location: toPlain(args[3]),
          bullets: [],
        };
        resume.experience.push(job);
        current = { kind: "job", ref: job };
      }
    } else if (mm[1] === "resumeProjectHeading") {
      const { args, end } = readGroups(body, after, 2);
      if (args.length < 2) continue;
      macroRe.lastIndex = end;
      const project = parseProjectHeading(args[0], args[1]);
      resume.projects.push(project);
      current = { kind: "project", ref: project };
    } else {
      const g = readGroup(body, after);
      if (!g) continue;
      macroRe.lastIndex = g.end;
      if (!current) continue;
      const text = toMarkup(g.content);
      if (!text) continue;
      current.ref.bullets.push({ id: uid("b"), text, tools: [], metrics: [] });
    }
  }

  // Derive tools & metrics once the full skill vocabulary is known.
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
    r.education.length + r.skills.length + r.experience.length + r.projects.length === 0 &&
    !r.contact.name
  );
}
