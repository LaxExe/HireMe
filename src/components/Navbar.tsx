"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Briefcase, Users, Sparkles, Database } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function Navbar() {
  const [activeTab, setActiveTab] = useState("overview");

  const navTabs = [
    { id: "overview", label: "Overview", icon: Sparkles },
    { id: "roles", label: "Roles", icon: Briefcase, count: 0 },
    { id: "candidates", label: "Candidates", icon: Users, count: 0 },
  ];

  return (
    <>
      {/* Desktop Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#fafafa]/90 backdrop-blur-md border-b border-[#ebebeb] pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 sm:h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="cursor-pointer select-none flex items-center gap-2">
            <span className="font-semibold text-base sm:text-lg tracking-tight text-neutral-900 lowercase hover:opacity-80 transition-opacity">
              hireme
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-neutral-100 border border-[#ebebeb] text-neutral-600">
              v0.1
            </span>
          </Link>

          {/* Centered Floating Pill Navigation Dock */}
          <nav className="hidden sm:flex items-center p-1 bg-[#ebebeb]/60 rounded-full border border-[#ebebeb]">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-1.5 text-xs rounded-full transition-all duration-150 select-none active:scale-95 ${
                    isActive
                      ? "bg-white text-neutral-900 shadow-sm font-semibold"
                      : "text-neutral-500 hover:text-neutral-900 hover:bg-white/50 font-normal"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive ? "text-neutral-900 stroke-[2.5]" : "text-neutral-500 stroke-[1.75]"
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive
                          ? "bg-neutral-200 text-neutral-900 font-bold"
                          : "bg-neutral-200/70 text-neutral-600 font-medium"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Status Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-600 bg-white border border-[#ebebeb] px-2.5 py-1 rounded-full shadow-2xs">
              <span className={`w-1.5 h-1.5 rounded-full ${isFirebaseConfigured ? "bg-emerald-500" : "bg-neutral-400"}`} />
              <Database className="w-3 h-3 text-neutral-500" />
              <span>{isFirebaseConfigured ? "Firestore Live" : "Firestore Ready"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#ebebeb] px-3 py-1.5 pb-safe shadow-modal">
        <div className="grid grid-cols-3 gap-2">
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all relative active:scale-95 ${
                  isActive
                    ? "text-neutral-900 font-semibold bg-neutral-100/70"
                    : "text-neutral-500 hover:text-neutral-900 font-normal"
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-neutral-900 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                      {tab.count}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] tracking-tight mt-1 transition-all ${
                    isActive ? "font-semibold text-neutral-900" : "font-normal text-neutral-500"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
