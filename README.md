# HireMe

> High-performance, full-stack recruitment, resume alignment, and talent discovery platform built for speed, density, and zero cognitive friction.

HireMe connects candidates with opportunities through a precision-engineered interface inspired by the minimalist design systems of Linear, Vercel, and Supabase. It features an automated **LARP (Live Alignment & Reframe Pipeline) Engine** that tailors master resumes to specific job postings with mathematically calibrated line fits and realistic interview defensibility.

---

## 1. Features & Core Workflows

### 📄 Master Experience & LaTeX Engine (`/experience`)
* **Master Resume Management**: Store contact info, target role, education, skills, experience bullets, projects, and awards in a single source of truth.
* **Typographic Calibration**: Calibrates character budgets (e.g., 108 chars for 1-line bullets, 216 chars for 2-line bullets) to guarantee that compiled resumes fit onto exactly one page without awkward typographic overflows or line wraps.
* **Universal LaTeX Parser & Compiler**: Converts structured resumes into modern, publication-grade LaTeX and compiles them to high-resolution vector PDFs on demand.

### ⚡ LARP Alignment Engine (`/operations`)
* **Multi-Tier Keyword Extraction**:
  * **Tier 0 (Workflow & PM)**: Scans for tools like Agile, Jira, Linear, and Git for centralized, zero-stretch workflow context.
  * **Tier 1 (Framing Tech)**: Identifies high-leverage technical skills (e.g., AWS, Docker, Redis, GraphQL) that can be framed around existing code.
  * **Tier 2 (Deep Core Guardrails)**: Automatically detects and locks out high-risk claims (e.g., C++, CUDA, low-level OS internals, robotics) to prevent dangerous interview overclaims.
* **Smart Skill Swapping**: Automatically introduces missing job skills into relevant skills categories without bloating the resume.
* **Minimal Existing Bullet Mutations**: Reframes 1–5 words on real bullets to naturally weave in target keywords while preserving 90%+ of authentic work.
* **Malleable 1-Line Bullet Synthesizer**: Generates new, calibrated 1-line bullets across four distinct styles:
  1. *Casual & Direct*: Core feature logic & REST/backend code.
  2. *Simple Integration*: DevOps, containerization, and environment config.
  3. *Testing & Quality*: Automated unit/integration tests and structured error logging.
  4. *Workflow & Ops*: Cross-functional sprint delivery and ticket triage.
* **AI Believability Evaluator**: Runs a 4-pass verification process ranking proposals by defensibility in live interviews.

### 👁️ In-Screen Preview & PDF Visualizer (`/preview`)
* **Queue Management**: Review multiple tailored resume slots generated from different job postings.
* **On-Screen PDF Visualizer**: Live in-browser iframe PDF visualizer eliminates the need to download files while reviewing modifications.
* **Regenerate Options**: Click **Regenerate Options** to immediately explore alternative phrasing variants and different candidate bullet slots.
* **Job Signals & Raw Job Description Drawer**: Displays extracted tech, workflow tools, and matched stack badges alongside an expandable viewer of the original job description.
* **Push to Agents**: With one click, transfers the tailored resume to the submission tracker and prunes it permanently from Preview.

### 🤖 Agents & Submission Tracker (`/agents`)
* **Submission Pipeline**: Tracks tailored resumes pushed for application.
* **Sent Tracking**: Mark jobs as applied with timestamps and direct links to the job postings.
* **Archiving & Download**: Archive completed submissions and download ready-to-send PDF files.

---

## 2. Architecture & Tech Stack

```
HireMe/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Minimalist landing page
│   │   ├── experience/page.tsx    # Master resume & LaTeX editor
│   │   ├── operations/page.tsx    # LARP Alignment Engine & JD scanner
│   │   ├── preview/page.tsx       # Slot queue, PDF visualizer & regenerator
│   │   ├── agents/page.tsx        # Application pipeline & submission tracker
│   │   ├── login/page.tsx         # Firebase Authentication interface
│   │   └── api/resume/compile-pdf # Server-side LaTeX-to-PDF compilation route
│   ├── components/
│   │   ├── Navbar.tsx             # Centered pill dock navigation
│   │   └── Footer.tsx             # Hairline minimal footer
│   ├── context/
│   │   └── AuthContext.tsx        # Firebase Auth & session management
│   └── lib/
│       ├── firebase.ts            # Firebase client SDK & Realtime Database init
│       ├── db.ts                  # Roles, candidates, and job data operations
│       ├── offlineSync.ts         # Offline-first queue & auto-reconnect sync
│       └── resume/
│           ├── larpEngine.ts      # Multi-tier JD analysis & bullet synthesis
│           ├── previewQueue.ts    # Preview slots queue & persistence
│           ├── agentsQueue.ts     # Applied jobs tracker & Firebase logger
│           ├── store.ts           # Master resume storage adapter
│           └── exportPdf.ts       # PDF compilation and download utilities
```

* **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons.
* **Backend & Database**: Firebase Realtime Database & Firebase Authentication.
* **Typography**: Geist Sans (`font-sans`) and Geist Mono (`font-mono`).
* **Deployment**: Vercel (Edge network, Fluid compute, production CI/CD).

---

## 3. Database & Offline-First Sync Engine

HireMe operates an **offline-first hybrid data engine** managed by [src/lib/offlineSync.ts](src/lib/offlineSync.ts):

### Online Mode (Active WiFi / Network)
* All applications, tailored resumes, and pipeline changes write directly to Firebase Realtime Database.
* Local storage sync queue is bypassed.

### Offline Mode (Disconnected / Airplane Mode)
* When offline, all queue additions and job submissions are buffered in `localStorage` under `hireme_offline_sync_queue`.
* Users can continue tailoring resumes, modifying bullets, and submitting applications without UI interruption.

### Automatic Reconnect Flush
* The `initOfflineSyncListener` monitors browser `online` and `focus` events.
* As soon as an internet connection is detected, all pending actions are automatically flushed to Firebase, and the local queue is purged.

---

## 4. Realtime Database Schema

```json
{
  "appliedJobs": {
    "-Oxyz123": {
      "jobTitle": "Senior Full Stack Engineer",
      "jobUrl": "https://company.com/careers/123",
      "status": "applied",
      "timestamp": "2026-11-13T16:00:00.000Z"
    }
  },
  "masterResumes": {
    "<uid>": {
      "data": "{...json stringified master resume...}",
      "updatedAt": "2026-11-13T16:00:00.000Z"
    }
  },
  "previewQueues": {
    "<uid>": {
      "data": "[...preview slot items...]",
      "updatedAt": "2026-11-13T16:00:00.000Z"
    }
  },
  "agentsQueues": {
    "<uid>": {
      "data": "[...tailored submission entries...]",
      "updatedAt": "2026-11-13T16:00:00.000Z"
    }
  },
  "roles": { ... },
  "candidates": { ... }
}
```

### Security & Privacy Model
Firebase Realtime Database rules enforce strict isolation:
* **`appliedJobs`**: `.read: false` (Zero public reading; accessible only to the project owner via Firebase Console).
* **`masterResumes` / `agentsQueues` / `previewQueues`**: `.read: "auth != null && auth.uid === $uid"` (Each user can only read and write their own data).
* **`roles`**: Publicly readable for job discovery.

---

## 5. Getting Started

### Prerequisites
* Node.js 18.17+ or Node.js 20+
* npm or pnpm

### Environment Setup
Create a `.env.local` file in the project root:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Install Dependencies & Run
```bash
# Install packages
npm install

# Start local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Verify
```bash
npm run build
```

---

## 6. Deployment

The project is configured for seamless deployment on Vercel:

```bash
# Preview deployment
npx vercel

# Production release
npx vercel --prod
```

Ensure environment variables are configured in the Vercel dashboard or via the Vercel CLI (`vercel env add`).
