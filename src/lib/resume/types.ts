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
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  oneLineMax: 108,
  twoLineMax: 216,
};

export type ResumeSectionKey =
  | "contact"
  | "education"
  | "skills"
  | "experience"
  | "projects"
  | "awards";

export interface MasterResume {
  version: 1;
  updatedAt: string;
  calibration?: CalibrationConfig;
  /** Sections detected in the imported resume template. */
  sections?: ResumeSectionKey[];
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
    contact: { name: "", location: "", phone: "", email: "", links: [] },
    education: [],
    skills: [],
    experience: [],
    projects: [],
    awards: [],
  };
}
