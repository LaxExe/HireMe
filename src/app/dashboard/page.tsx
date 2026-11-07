"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/experience");
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
      Redirecting to workspace...
    </div>
  );
}
