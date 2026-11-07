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

export interface MasterResume {
  version: 1;
  updatedAt: string;
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
    contact: { name: "", location: "", phone: "", email: "", links: [] },
    education: [],
    skills: [],
    experience: [],
    projects: [],
  };
}
