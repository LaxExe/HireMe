import React from "react";

export default function Footer() {
  return (
    <footer className="border-t border-[#ebebeb] bg-[#fafafa] py-6 text-neutral-500 text-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-900 lowercase tracking-tight">
            hireme
          </span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-600">minimalist recruitment engine</span>
        </div>
      </div>
    </footer>
  );
}
