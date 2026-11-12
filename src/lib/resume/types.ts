export interface Bullet {
  id: string;
  /** Text with `**bold**` markers preserved from the source resume. */
  text: string;
  tools: string[];
  metrics: string[];
}

export interface Job {
  id: string;
  title: string;
  company: string;
  companyUrl: string;
  /** Preserved FontAwesome icon macro from LaTeX, e.g. `\faLink` or `\faExternalLink*`. */
  companyIcon?: string;
  location: string;
  dates: string;
  bullets: Bullet[];
  /** True if parsed from a separate Leadership & Extracurriculars section. */
  isLeadership?: boolean;
}

export interface Project {
  id: string;
  name: string;
  url: string;
  /** Preserved FontAwesome icon macro from LaTeX, e.g. `\faGithub` or `\faLink`. */
  linkIcon?: string;
  techStack: string[];
  meta: string;
  bullets: Bullet[];
}

export interface Education {
  id: string;
  institution: string;
  location: string;
  degree: string;
  dates: string;
  bullets?: Bullet[];
}

export interface Skill {
  id: string;
  name: string;
}

export interface SkillCategory {
  id: string;
  name: string;
  skills: Skill[];
}

export interface ContactLink {
  id: string;
  kind: "linkedin" | "github" | "website" | "other";
  label: string;
  url: string;
  /** Preserved FontAwesome icon macro from LaTeX, e.g. `\faLinkedin`, `\faGlobe`, `\faGithub`. */
  icon?: string;
}

export interface Contact {
  name: string;
  location: string;
  phone: string;
  email: string;
  links: ContactLink[];
}

export interface Award {
  id: string;
  title: string;
  date: string;
  description: string;
}

export interface CalibrationConfig {
  /** Maximum character length of a single full line in LaTeX. */
  oneLineMax: number;
  /** Maximum character length of a full two-line bullet in LaTeX. */
  twoLineMax: number;
  /** Number of new 1-line LARP bullet points allowed to be synthesized into the single best-fitting role or project. */
  malleableLines?: number;
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  oneLineMax: 108,
  twoLineMax: 216,
  malleableLines: 1,
};

export type ResumeSectionKey =
  | "contact"
  | "education"
  | "skills"
  | "experience"
  | "projects"
  | "awards";

export interface ResumeFormat {
  paperSize: "letter" | "a4";
  baseFontSizePt: 10 | 11 | 12;
  fontFamily: "helvetica" | "noto-sans" | "sans" | "serif";
  fontScale: number;
  margins: {
    topIn: number;
    bottomIn: number;
    leftIn: number;
    rightIn: number;
  };
  lineSpread: number;
  mutedGray: number;
  headerStyle: {
    alignment: "center" | "left";
    nameSize: "Huge" | "LARGE" | "Large";
    nameBold: boolean;
    showIcons: boolean;
    underlineLinks: boolean;
    separator: "cdot" | "bar" | "bullet";
  };
  sectionStyle: {
    macroName?: string;
    uppercase: boolean;
    bold: boolean;
    size: "large" | "Large" | "normalsize";
    hasRule: boolean;
    ruleHeightPt: number;
    spaceAbovePt: number;
    spaceBelowPt: number;
    titles: Partial<Record<ResumeSectionKey, string>>;
    leadershipTitle?: string;
    order: ResumeSectionKey[];
  };
  entryStyle: {
    layout: "subheading-macro" | "hfill-italic";
    companyFirst: boolean;
    line2Bold: boolean;
    rightItalic: boolean;
    rightMuted: boolean;
    showLinkIcons: boolean;
    projectTechStyle: "muted" | "italic" | "plain";
    entrySpacingPt: number;
  };
  skillStyle: {
    layout: "compact-lines" | "itemize-bullets";
    colonInsideBold: boolean;
    smallText: boolean;
  };
  bulletStyle: {
    leftMarginIn: number;
    itemSepPt: number;
    topSepPt: number;
    smallText: boolean;
  };
}

export const DEFAULT_RESUME_FORMAT: ResumeFormat = {
  paperSize: "letter",
  baseFontSizePt: 11,
  fontFamily: "helvetica",
  fontScale: 0.95,
  margins: {
    topIn: 0.5,
    bottomIn: 0.5,
    leftIn: 0.5,
    rightIn: 0.5,
  },
  lineSpread: 1.05,
  mutedGray: 0.35,
  headerStyle: {
    alignment: "center",
    nameSize: "Huge",
    nameBold: true,
    showIcons: true,
    underlineLinks: true,
    separator: "cdot",
  },
  sectionStyle: {
    macroName: "section",
    uppercase: false,
    bold: true,
    size: "large",
    hasRule: true,
    ruleHeightPt: 0.5,
    spaceAbovePt: 6,
    spaceBelowPt: 3,
    titles: {
      education: "EDUCATION",
      skills: "TECHNICAL SKILLS",
      experience: "EXPERIENCE",
      projects: "PROJECTS",
      awards: "SCHOLARSHIPS & AWARDS",
    },
    order: ["education", "skills", "experience", "projects", "awards"],
  },
  entryStyle: {
    layout: "subheading-macro",
    companyFirst: false,
    line2Bold: false,
    rightItalic: false,
    rightMuted: true,
    showLinkIcons: true,
    projectTechStyle: "muted",
    entrySpacingPt: 4,
  },
  skillStyle: {
    layout: "compact-lines",
    colonInsideBold: false,
    smallText: true,
  },
  bulletStyle: {
    leftMarginIn: 0.15,
    itemSepPt: 2,
    topSepPt: 3,
    smallText: true,
  },
};

export interface MasterResume {
  version: 1;
  updatedAt: string;
  calibration?: CalibrationConfig;
  /** Sections detected in the imported resume template. */
  sections?: ResumeSectionKey[];
  /** Extracted formatting and layout style from the uploaded LaTeX file. */
  format?: ResumeFormat;
  /** Original uploaded LaTeX source for reference/reconstruction. */
  rawLatex?: string;
  contact: Contact;
  education: Education[];
  skills: SkillCategory[];
  experience: Job[];
  projects: Project[];
  awards: Award[];
}

export function hasResumeSection(resume: MasterResume, key: ResumeSectionKey): boolean {
  const count =
    key === "contact"
      ? resume.contact.name ||
        resume.contact.email ||
        resume.contact.phone ||
        resume.contact.location ||
        resume.contact.links.length > 0
        ? 1
        : 0
      : key === "education"
      ? resume.education.length
      : key === "skills"
      ? resume.skills.length
      : key === "experience"
      ? resume.experience.length
      : key === "projects"
      ? resume.projects.length
      : (resume.awards ?? []).length;

  if (count > 0) return true;
  if (resume.sections) return resume.sections.includes(key);
  return key === "contact";
}

export function emptyResume(): MasterResume {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    calibration: { ...DEFAULT_CALIBRATION },
    format: structuredClone(DEFAULT_RESUME_FORMAT),
    contact: { name: "", location: "", phone: "", email: "", links: [] },
    education: [],
    skills: [],
    experience: [],
    projects: [],
    awards: [],
  };
}
