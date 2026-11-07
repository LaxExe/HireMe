"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, Sliders, Eye, Bot, LogOut } from "lucide-react";

export const navTabs = [
  { id: "experience", label: "Experience", href: "/experience", icon: Sparkles },
  { id: "operations", label: "Operations", href: "/operations", icon: Sliders },
  { id: "preview", label: "Preview", href: "/preview", icon: Eye },
  { id: "agents", label: "Agents", href: "/agents", icon: Bot },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#fafafa]/90 backdrop-blur-md border-b border-[#ebebeb] pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link
            href={user ? "/experience" : "/"}
            className="cursor-pointer select-none"
          >
            <span className="font-semibold text-base sm:text-lg tracking-tight text-neutral-900 lowercase hover:opacity-80 transition-opacity">
              hireme
            </span>
          </Link>

          {/* Centered Floating Pill Navigation Dock (Authenticated) */}
          {user && (
            <nav className="hidden sm:flex items-center p-1 bg-[#ebebeb]/60 rounded-full border border-[#ebebeb]">
              {navTabs.map((tab) => {
                const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
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
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right Action */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-mono text-neutral-700 bg-white border border-[#ebebeb] px-2.5 py-1 rounded-full shadow-2xs">
                  @{user.username}
                </span>
                <button
                  onClick={() => signOut()}
                  title="Sign out"
                  className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors active:scale-95 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-900 px-3 py-1.5 rounded-full hover:bg-neutral-100/70 transition-all active:scale-95"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 px-3.5 py-1.5 rounded-full shadow-2xs transition-all active:scale-95"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Dock (Authenticated) */}
      {user && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#ebebeb] px-3 py-1.5 pb-safe shadow-modal">
          <div className="grid grid-cols-4 gap-1">
            {navTabs.map((tab) => {
              const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative active:scale-95 ${
                    isActive
                      ? "text-neutral-900 font-semibold bg-neutral-100/70"
                      : "text-neutral-500 hover:text-neutral-900 font-normal"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                  <span
                    className={`text-[10px] tracking-tight mt-1 transition-all ${
                      isActive ? "font-semibold text-neutral-900" : "font-normal text-neutral-500"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
