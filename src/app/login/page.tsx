"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight, Check } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // Validation rules
  const rules = useMemo(() => {
    return {
      hasLength: password.length >= 8,
      hasNumber: /\d/.test(password),
      hasLetter: /[a-zA-Z]/.test(password),
      hasMatch: confirmPassword.length > 0 && password === confirmPassword,
    };
  }, [password, confirmPassword]);

  const strengthScore = useMemo(() => {
    let score = 0;
    if (rules.hasLength) score += 1;
    if (rules.hasNumber && rules.hasLetter) score += 1;
    if (password.length >= 12 || /[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    return score;
  }, [password, rules]);

  const isSignupValid =
    username.trim().length >= 3 &&
    email.includes("@") &&
    rules.hasLength &&
    rules.hasNumber &&
    rules.hasLetter &&
    rules.hasMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (!username.trim() || username.trim().length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (!rules.hasLength || !rules.hasNumber || !rules.hasLetter) {
        setError("Password does not meet strength criteria.");
        return;
      }
      if (!rules.hasMatch) {
        setError("Passwords do not match.");
        return;
      }
    } else {
      if (!email || !password) {
        setError("Please enter your email and password.");
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        await signUp(email, password, username);
      } else {
        await signIn(email, password);
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-2 sm:py-3">
      {/* Taller-than-wide container with no-scroll compact vertical profile */}
      <div className="w-full max-w-[325px] bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-5 sm:p-6 space-y-3.5 animate-scaleIn">
        {/* Mode Switcher */}
        <div className="flex items-center p-0.5 bg-[#ebebeb]/60 rounded-full border border-[#ebebeb] text-xs">
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 py-1 rounded-full text-xs transition-all active:scale-95 ${
              mode === "signup"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-900 font-normal"
            }`}
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`flex-1 py-1 rounded-full text-xs transition-all active:scale-95 ${
              mode === "signin"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-500 hover:text-neutral-900 font-normal"
            }`}
          >
            Sign in
          </button>
        </div>

        {/* Title */}
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
            {mode === "signup" ? "Create your account" : "Sign in to HireMe"}
          </h2>
          <p className="text-[11px] text-neutral-500">
            {mode === "signup"
              ? "Join HireMe to start recruiting."
              : "Enter your credentials to continue."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-2.5">
          {mode === "signup" && (
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-0.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="username"
                required
                autoFocus
                className="w-full px-2.5 py-1.5 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-neutral-700 mb-0.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoFocus={mode === "signin"}
              className="w-full px-2.5 py-1.5 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-neutral-700 mb-0.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-2.5 py-1.5 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          {mode === "signup" && (
            <>
              {/* Segmented Strength Bar */}
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-1">
                  <div
                    className={`h-1 rounded-full transition-colors ${
                      strengthScore >= 1
                        ? strengthScore === 1
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                        : "bg-neutral-200"
                    }`}
                  />
                  <div
                    className={`h-1 rounded-full transition-colors ${
                      strengthScore >= 2 ? "bg-emerald-500" : "bg-neutral-200"
                    }`}
                  />
                  <div
                    className={`h-1 rounded-full transition-colors ${
                      strengthScore >= 3 ? "bg-emerald-500" : "bg-neutral-200"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-700 mb-0.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-2.5 py-1.5 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
                />
              </div>

              {/* Checklist */}
              <div className="pt-1 space-y-1 border-t border-[#ebebeb]/70">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className={`w-3 h-3 rounded-full flex items-center justify-center transition-colors ${
                      rules.hasLength ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <Check className="w-2 h-2 stroke-[3]" />
                  </span>
                  <span className={rules.hasLength ? "text-neutral-700" : "text-neutral-400"}>
                    8+ characters
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className={`w-3 h-3 rounded-full flex items-center justify-center transition-colors ${
                      rules.hasNumber && rules.hasLetter
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <Check className="w-2 h-2 stroke-[3]" />
                  </span>
                  <span className={rules.hasNumber && rules.hasLetter ? "text-neutral-700" : "text-neutral-400"}>
                    Letters and numbers
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className={`w-3 h-3 rounded-full flex items-center justify-center transition-colors ${
                      rules.hasMatch ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <Check className="w-2 h-2 stroke-[3]" />
                  </span>
                  <span className={rules.hasMatch ? "text-neutral-700" : "text-neutral-400"}>
                    Passwords match
                  </span>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-2 rounded-md bg-red-50 border border-red-200/50 text-[10px] text-red-600 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === "signup" && !isSignupValid)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full transition-all shadow-subtle active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{loading ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</span>
            {!loading && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
