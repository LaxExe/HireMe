"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function OperationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 pb-20 sm:pb-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ebebeb] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            operations
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Hiring workflows and pipeline configurations
          </p>
        </div>
      </div>

      {/* Surface Card */}
      <div className="w-full bg-white rounded-xl border border-[#ebebeb] shadow-subtle min-h-[380px] flex items-center justify-center p-8">
        <p className="text-xs font-mono text-neutral-400">
          operations workspace ready
        </p>
      </div>
    </div>
  );
}
