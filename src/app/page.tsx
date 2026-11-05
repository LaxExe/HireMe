import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-neutral-900 lowercase select-none">
        hireme
      </h1>
      <Link
        href="/login"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-full shadow-subtle hover:shadow-subtle-hover active:scale-95 transition-all duration-150"
      >
        <span>Get Started</span>
        <ArrowUpRight className="w-3.5 h-3.5 stroke-[2]" />
      </Link>
    </div>
  );
}
