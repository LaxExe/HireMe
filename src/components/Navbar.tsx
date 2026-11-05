import React from "react";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 bg-[#fafafa]/90 backdrop-blur-md border-b border-[#ebebeb] pt-safe">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="cursor-pointer select-none">
          <span className="font-semibold text-base sm:text-lg tracking-tight text-neutral-900 lowercase hover:opacity-80 transition-opacity">
            hireme
          </span>
        </Link>

        {/* Right Action */}
        <div className="flex items-center gap-3">
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
      </div>
    </header>
  );
}
