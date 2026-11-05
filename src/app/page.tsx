"use client";

import React, { useState } from "react";
import { ArrowUpRight, Terminal, CheckCircle2, Layers } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function Home() {
  const [interacted, setInteracted] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 max-w-2xl mx-auto py-12">
      {/* Status Pill */}
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-[#ebebeb] rounded-full text-xs font-mono text-neutral-600 shadow-2xs">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>System Ready</span>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-400">Foundation v0.1</span>
      </div>

      {/* Main Hero Header */}
      <div className="space-y-3">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-neutral-900 lowercase">
          hireme
        </h1>
        <p className="text-sm sm:text-base text-neutral-600 max-w-md mx-auto leading-relaxed">
          Minimalist, high-density talent discovery foundation. Built for speed, precision, and zero friction.
        </p>
      </div>

      {/* Primary Action Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setInteracted(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-full shadow-subtle hover:shadow-subtle-hover active:scale-95 transition-all duration-150 cursor-pointer"
        >
          <span>Get Started</span>
          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2]" />
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-medium rounded-full border border-[#ebebeb] shadow-2xs active:scale-95 transition-all duration-150"
        >
          <Terminal className="w-3.5 h-3.5 text-neutral-500" />
          <span>Documentation</span>
        </a>
      </div>

      {/* Interactive feedback card */}
      {interacted && (
        <div className="w-full p-4 bg-white border border-[#ebebeb] rounded-xl shadow-subtle text-left animate-scaleIn">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Ready for feature development</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Foundation building blocks are linked: Next.js App Router, Tailwind CSS, Firebase Firestore client, and Vercel hosting.
          </p>
        </div>
      )}

      {/* Building Blocks Cards Container */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-6">
        <div className="p-4 bg-white border border-[#ebebeb] rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900">
            <Layers className="w-4 h-4 text-neutral-700" />
            <span>Minimal Core</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Clean layout shell with responsive sticky pill header and footer.
          </p>
        </div>

        <div className="p-4 bg-white border border-[#ebebeb] rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Vercel Edge</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Optimized for instantaneous global edge delivery and SSR.
          </p>
        </div>

        <div className="p-4 bg-white border border-[#ebebeb] rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900">
            <span className={`w-2 h-2 rounded-full ${isFirebaseConfigured ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span>Firebase DB</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            {isFirebaseConfigured
              ? "Firestore live connection initialized."
              : "Firestore client configured with environment variable bindings."}
          </p>
        </div>
      </div>
    </div>
  );
}
