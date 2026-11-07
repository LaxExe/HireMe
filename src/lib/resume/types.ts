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
  location: string;
  dates: string;
  bullets: Bullet[];
}

export interface Project {
  id: string;
  name: string;
  url: string;
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
}

export interface Contact {
  name: string;
  location: string;
  phone: string;
  email: string;
  links: ContactLink[];
}

export interface CalibrationConfig {
  /** Maximum character length of a single full line in LaTeX. */
  oneLineMax: number;
  /** Maximum character length of a full two-line bullet in LaTeX. */
  twoLineMax: number;
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  oneLineMax: 108,
  twoLineMax: 216,
};

export interface MasterResume {
  version: 1;
  updatedAt: string;
  calibration?: CalibrationConfig;
  contact: Contact;
  education: Education[];
  skills: SkillCategory[];
  experience: Job[];
  projects: Project[];
}

export function emptyResume(): MasterResume {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    calibration: { ...DEFAULT_CALIBRATION },
    contact: { name: "", location: "", phone: "", email: "", links: [] },
    education: [],
    skills: [],
    experience: [],
    projects: [],
  };
}
