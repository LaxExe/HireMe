import React from "react";

export default function Footer() {
  return (
    <footer className="border-t border-[#ebebeb] bg-[#fafafa] py-8 text-neutral-500 text-xs sm:mb-0 mb-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-900 lowercase tracking-tight">
            hireme
          </span>
          <span className="text-neutral-400">·</span>
          <span>minimalist recruitment engine</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-neutral-400">
          <span>built on next.js & vercel</span>
          <span>·</span>
          <span>firebase firestore</span>
        </div>
      </div>
    </footer>
  );
}
