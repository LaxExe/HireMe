"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  username: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = "hireme_active_user";
const LOCAL_STORAGE_ACCOUNTS_KEY = "hireme_local_accounts";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFirebaseConfigured) {
      const unsubscribe = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
        if (fbUser) {
          const appUser: AppUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            username: fbUser.displayName || fbUser.email?.split("@")[0] || "user",
          };
          setUser(appUser);
          localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(appUser));
        } else {
          setUser(null);
          localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      // Localhost / offline fallback mode
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (stored) {
          setUser(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Failed to restore local session", e);
      }
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, pass: string) => {
    if (isFirebaseConfigured) {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const appUser: AppUser = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName,
        username: cred.user.displayName || cred.user.email?.split("@")[0] || "user",
      };
      setUser(appUser);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(appUser));
    } else {
      // Local storage auth validation
      const rawAccounts = localStorage.getItem(LOCAL_STORAGE_ACCOUNTS_KEY);
      const accounts = rawAccounts ? JSON.parse(rawAccounts) : [];
      const existing = accounts.find(
        (a: { email: string; pass: string }) => a.email.toLowerCase() === email.toLowerCase()
      );

      if (existing && existing.pass !== pass) {
        throw new Error("Invalid password.");
      }

      const username = existing?.username || email.split("@")[0] || "user";
      const appUser: AppUser = {
        uid: existing?.uid || `local-${Date.now()}`,
        email,
        displayName: username,
        username,
      };

      // Auto-save account for localhost ease of use
      if (!existing) {
        accounts.push({ uid: appUser.uid, email, pass, username });
        localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(accounts));
      }

      setUser(appUser);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(appUser));
    }
  };

  const signUp = async (email: string, pass: string, username: string) => {
    const cleanUsername = username.trim().toLowerCase();
    if (isFirebaseConfigured) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (cleanUsername) {
        await updateProfile(cred.user, { displayName: cleanUsername });
      }
      const appUser: AppUser = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cleanUsername,
        username: cleanUsername,
      };
      setUser(appUser);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(appUser));
    } else {
      // Local storage persistence
      const rawAccounts = localStorage.getItem(LOCAL_STORAGE_ACCOUNTS_KEY);
      const accounts = rawAccounts ? JSON.parse(rawAccounts) : [];
      const existing = accounts.find(
        (a: { email: string }) => a.email.toLowerCase() === email.toLowerCase()
      );

      if (existing) {
        throw new Error("An account with this email already exists.");
      }

      const appUser: AppUser = {
        uid: `local-${Date.now()}`,
        email,
        displayName: cleanUsername,
        username: cleanUsername,
      };

      accounts.push({ uid: appUser.uid, email, pass, username: cleanUsername });
      localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(accounts));
      setUser(appUser);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(appUser));
    }
  };

  const signOut = async () => {
    if (isFirebaseConfigured) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
