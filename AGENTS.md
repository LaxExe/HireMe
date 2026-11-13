# HireMe - Agent Guidelines & Engineering Specifications

## 1. Project Overview & Vision
HireMe is a high-performance, full-stack recruitment and talent discovery platform built for speed, density, and zero cognitive friction. It connects candidates with opportunities through a minimalist, precision-engineered interface.

- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons, Firebase (Firestore & Auth).
- **Deployment**: Vercel (Production & Preview Deployments).
- **Design Philosophy**: Minimalist Engineering Design System (inspired by Linear, Vercel, and Supabase).

---

## 2. Core Design System Standards
All agents and developers modifying HireMe must strictly adhere to the following UI/UX rules:

### 2.1 Palette & Surfaces
- **Canvas Background**: `#fafafa` (`bg-[#fafafa]`)
- **Card / Surface**: `#ffffff` (`bg-white`)
- **Subtle Surface**: `#f5f5f5` (`bg-neutral-100`)
- **Hairlines & Dividers**: `1px solid #ebebeb` (`border-[#ebebeb]`)
- **Primary Ink**: `#171717` (`text-neutral-900`)
- **Secondary Ink**: `#525252` (`text-neutral-600`)
- **Muted / Mono Ink**: `#737373` (`text-neutral-500`)
- **Disabled Ink**: `#a8a8a8` (`text-neutral-400`)

### 2.2 Typography
- **Primary UI Font**: Geist Sans (`font-sans`), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto.
- **Monospace Precision Font**: Geist Mono (`font-mono`) strictly for dates, timestamps, badge counts, IDs, and metrics.
- **Brand Title**: Lowercase or tight Title Case, clean letter-spacing (`tracking-tight`).

### 2.3 Navigation Architecture
- **Desktop**: Fixed or sticky translucent top bar (`bg-[#fafafa]/90 backdrop-blur-md border-b border-[#ebebeb]`) with centered floating pill navigation dock (`bg-[#ebebeb]/60 rounded-full border border-[#ebebeb] p-1`). Active tab is `bg-white text-neutral-900 shadow-sm font-semibold`.
- **Mobile**: Native iOS-grade bottom dock (`sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#ebebeb] pb-safe`).

### 2.4 Tactility & Micro-Interactions
- Tactile spring feedback on all interactive elements: `active:scale-95 transition-all duration-150`.
- Delicate shadows only: `shadow-2xs` (`0 1px 2px rgba(0, 0, 0, 0.04)`), `shadow-subtle` (`0 0 0 1px #00000014, 0px 2px 2px #0000000a`), `shadow-modal`.
- No heavy drop shadows or saturated glowing backdrops.

### 2.5 Strict Anti-Patterns
1. ❌ **No Textual Helper Hints**: Never include `(click to toggle)`, `(collapse)`, `(expand)`, or instructional captions under basic headers. Let interface affordance guide the user.
2. ❌ **No Border Clipping**: Any 4px colored accent border must be applied on the outer container (`rounded-xl overflow-hidden`) or use inset rounded vertical pill bars. Never allow divider lines to slice through accent bars.
3. ❌ **No Saturated Backdrops**: Keep surfaces predominantly monochrome and calm. Color is reserved for semantic badges, status, and tags.

---

## 3. Architecture & File Structure
```
hireme/
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout with fonts, metadata, and safe padding
│   │   ├── page.tsx           # Minimalist landing page
│   │   ├── globals.css        # Tailwind directives and custom animation tokens
│   │   └── api/               # API route handlers
│   ├── components/
│   │   ├── Navbar.tsx         # Responsive sticky header with centered pill dock
│   │   ├── Footer.tsx         # Hairline minimal footer
│   │   └── ui/                # Reusable design system primitives
│   └── lib/
│       ├── firebase.ts        # Firebase client SDK initialization & Firestore db
│       └── utils.ts           # Class merging and styling helpers
├── AGENTS.md                  # Agent operating instructions
├── agents.md                  # Alternate casing entrypoint
├── DESIGN_SYSTEM.md           # Full design specification
├── package.json
└── tsconfig.json
```

---

## 4. Firebase Database Conventions
- Firestore is used as the document database.
- Configuration is loaded via environment variables:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- When environment variables are missing during local build or initial staging, the Firebase client gracefully falls back to safe defaults so builds and deployments never break.

---

## 5. Development Workflow & Pull Request Standards
- **No Direct Production Deploys**: Do not deploy changes directly to production for routine feature or design tasks.
- **Branching Strategy**:
  - Always develop new features or bug fixes in dedicated branches (e.g., `feature/<feature-name>`, `fix/<issue-name>`).
  - Maintain clean, conventional git commit messages (e.g., `feat: ...`, `fix: ...`).
- **Pull Request Protocol**:
  - Open structured Pull Requests with clear descriptions and summary bullet points.
  - Ensure all local verification passes (`npm run build`) before submitting the PR.
  - Production deployments should only happen upon explicit merge or release instructions.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
