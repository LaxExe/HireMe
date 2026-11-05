"use client";

import React, { useState, useMemo } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password rules validation
  const rules = useMemo(() => {
    return {
      hasLength: password.length >= 8,
      hasNumber: /\d/.test(password),
      hasLetter: /[a-zA-Z]/.test(password),
      hasMatch: confirmPassword.length > 0 && password === confirmPassword,
    };
  }, [password, confirmPassword]);

  // Overall strength score (0 to 3) based on password complexity
  const strengthScore = useMemo(() => {
    let score = 0;
    if (rules.hasLength) score += 1;
    if (rules.hasNumber && rules.hasLetter) score += 1;
    if (password.length >= 12 || /[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    return score;
  }, [password, rules]);

  const strengthLabel = useMemo(() => {
    if (!password) return "empty";
    if (strengthScore <= 1) return "weak";
    if (strengthScore === 2) return "moderate";
    return "strong";
  }, [password, strengthScore]);

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
    setSuccess(null);

    if (mode === "signup") {
      if (!username.trim() || username.trim().length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (!rules.hasLength || !rules.hasNumber || !rules.hasLetter) {
        setError("Password does not meet strength requirements.");
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
      if (isFirebaseConfigured) {
        if (mode === "signin") {
          await signInWithEmailAndPassword(auth, email, password);
          setSuccess("Signed in successfully.");
        } else {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          if (username.trim()) {
            await updateProfile(userCredential.user, { displayName: username.trim() });
          }
          setSuccess("Account created successfully.");
        }
      } else {
        // Safe demo placeholder
        await new Promise((resolve) => setTimeout(resolve, 500));
        setSuccess(
          mode === "signin"
            ? "Signed in (demo mode)."
            : `Account created for @${username.trim() || "user"} (demo mode).`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] py-8 px-4">
      {/* Taller-than-wide container: fixed narrow width (330px) for sleek vertical portrait ratio */}
      <div className="w-full max-w-[330px] bg-white rounded-xl border border-[#ebebeb] shadow-subtle p-6 sm:p-7 space-y-5 animate-scaleIn">
        {/* Mode Switcher */}
        <div className="flex items-center p-0.5 bg-[#ebebeb]/60 rounded-full border border-[#ebebeb] text-xs">
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
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">
            {mode === "signup" ? "Create your account" : "Sign in to HireMe"}
          </h2>
          <p className="text-xs text-neutral-500">
            {mode === "signup"
              ? "Join HireMe to access opportunities."
              : "Enter your credentials to continue."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="username"
                required
                autoFocus
                className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs font-mono"
              />
            </div>
          )}

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
              autoFocus={mode === "signin"}
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-neutral-700">
                Password
              </label>
              {mode === "signup" && password.length > 0 && (
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                  {strengthLabel}
                </span>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          {mode === "signup" && (
            <>
              {/* Segmented Strength Bar */}
              <div className="space-y-1.5 pt-0.5">
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
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
                />
              </div>

              {/* Password Quality Criteria Checklist */}
              <div className="pt-1 pb-1 space-y-1.5 border-t border-[#ebebeb]/70">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                      rules.hasLength ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </span>
                  <span className={rules.hasLength ? "text-neutral-700" : "text-neutral-400"}>
                    8+ characters
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                      rules.hasNumber && rules.hasLetter
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </span>
                  <span className={rules.hasNumber && rules.hasLetter ? "text-neutral-700" : "text-neutral-400"}>
                    Letters and numbers
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                      rules.hasMatch ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </span>
                  <span className={rules.hasMatch ? "text-neutral-700" : "text-neutral-400"}>
                    Passwords match
                  </span>
                </div>
              </div>
            </>
          )}

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
            disabled={loading || (mode === "signup" && !isSignupValid)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full transition-all shadow-subtle active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer pt-2"
          >
            <span>{loading ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</span>
            {!loading && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
