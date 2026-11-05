"use client";

import React, { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);

    try {
      if (isFirebaseConfigured) {
        if (mode === "signin") {
          await signInWithEmailAndPassword(auth, email, password);
          setSuccess("Signed in successfully.");
        } else {
          await createUserWithEmailAndPassword(auth, email, password);
          setSuccess("Account created successfully.");
        }
      } else {
        // Placeholder / offline mode for initial scaffolding
        await new Promise((resolve) => setTimeout(resolve, 500));
        setSuccess(mode === "signin" ? "Signed in (demo mode)." : "Account created (demo mode).");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-6 space-y-5 animate-scaleIn">
        {/* Mode Switcher */}
        <div className="flex items-center p-0.5 bg-[#ebebeb]/60 rounded-full border border-[#ebebeb] text-xs">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-1 rounded-full text-xs transition-all active:scale-95 ${
              mode === "signin"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-900 font-normal"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-1 rounded-full text-xs transition-all active:scale-95 ${
              mode === "signup"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-900 font-normal"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">
            {mode === "signin" ? "Sign in to HireMe" : "Create your account"}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoFocus
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-red-50 border border-red-200/50 text-[11px] text-red-600 font-medium">
              {error}
            </div>
          )}

          {success && (
            <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200/50 text-[11px] text-emerald-700 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full transition-all shadow-subtle active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            <span>{loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}</span>
            {!loading && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
