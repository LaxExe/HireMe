"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getRoles,
  createRole,
  deleteRole,
  getCandidates,
  updateCandidateStage,
  Role,
  Candidate,
} from "@/lib/db";
import {
  Briefcase,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  MapPin,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<"roles" | "candidates">("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // New Role Form State
  const [showAddRole, setShowAddRole] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDepartment, setNewDepartment] = useState("Engineering");
  const [newLocation, setNewLocation] = useState("Remote");
  const [newType, setNewType] = useState("Full-time");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      try {
        const [r, c] = await Promise.all([getRoles(), getCandidates()]);
        setRoles(r);
        setCandidates(c);
      } catch (e) {
        console.error("Failed to load dashboard data:", e);
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, []);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const created = await createRole({
      title: newTitle.trim(),
      department: newDepartment,
      location: newLocation,
      type: newType,
      status: "active",
    });

    setRoles([created, ...roles]);
    setNewTitle("");
    setShowAddRole(false);
  };

  const handleDeleteRole = async (id: string) => {
    await deleteRole(id);
    setRoles(roles.filter((r) => r.id !== id));
  };

  const handleStageChange = async (id: string, stage: Candidate["stage"]) => {
    await updateCandidateStage(id, stage);
    setCandidates(candidates.map((c) => (c.id === id ? { ...c, stage } : c)));
  };

  if (authLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-xs text-neutral-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="flex-1 py-8 sm:py-12 space-y-6 animate-fadeIn">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ebebeb] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 lowercase">
            workspace
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Managing talent pipelines as <span className="font-mono text-neutral-800">@{user.username}</span>
          </p>
        </div>

        {/* Sub-view Segmented Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-0.5 bg-[#ebebeb]/60 rounded-full border border-[#ebebeb] text-xs">
            <button
              onClick={() => setTab("roles")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 ${
                tab === "roles"
                  ? "bg-white text-neutral-900 shadow-sm font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 font-normal"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Roles</span>
              <span className="font-mono text-[10px] ml-0.5 px-1.5 py-0.2 bg-neutral-100 rounded-full">
                {roles.length}
              </span>
            </button>
            <button
              onClick={() => setTab("candidates")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 ${
                tab === "candidates"
                  ? "bg-white text-neutral-900 shadow-sm font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 font-normal"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Candidates</span>
              <span className="font-mono text-[10px] ml-0.5 px-1.5 py-0.2 bg-neutral-100 rounded-full">
                {candidates.length}
              </span>
            </button>
          </div>

          {tab === "roles" && (
            <button
              onClick={() => setShowAddRole(!showAddRole)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-full shadow-2xs active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Role</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Create Role Form */}
      {showAddRole && (
        <form
          onSubmit={handleCreateRole}
          className="bg-white p-5 rounded-xl border border-[#ebebeb] shadow-subtle space-y-4 animate-scaleIn max-w-xl"
        >
          <div className="text-xs font-semibold text-neutral-900">Create New Position</div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Role Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Lead Machine Learning Engineer"
              autoFocus
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Department</label>
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 cursor-pointer"
              >
                <option value="Engineering">Engineering</option>
                <option value="Product">Product</option>
                <option value="Design">Design</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Location</label>
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Remote / City"
                className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-[#fafafa] border border-[#ebebeb] rounded-md focus:outline-none focus:border-neutral-900 cursor-pointer"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#ebebeb]">
            <button
              type="button"
              onClick={() => setShowAddRole(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md transition-colors disabled:opacity-40 shadow-subtle active:scale-95"
            >
              Publish Role
            </button>
          </div>
        </form>
      )}

      {/* Main Table / List Content */}
      {loadingData ? (
        <div className="py-12 text-center text-xs text-neutral-400 font-mono">
          Loading active pipelines...
        </div>
      ) : tab === "roles" ? (
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
          <ul className="divide-y divide-[#ebebeb]/70">
            {roles.map((r) => (
              <li
                key={r.id}
                className="p-3.5 sm:px-5 flex items-center justify-between gap-4 hover:bg-[#fafafa]/80 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-900 truncate">{r.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5">
                      <span>{r.department}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-neutral-400" />
                        {r.location}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-[#ebebeb]">
                    {r.type}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 hidden sm:inline">
                    {r.createdAt}
                  </span>
                  <button
                    onClick={() => handleDeleteRole(r.id)}
                    className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#ebebeb] shadow-subtle overflow-hidden">
          <ul className="divide-y divide-[#ebebeb]/70">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="p-3.5 sm:px-5 flex items-center justify-between gap-4 hover:bg-[#fafafa]/80 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-900 truncate">{c.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5">
                      <span>{c.email}</span>
                      <span>·</span>
                      <span>{c.roleTitle}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={c.stage}
                    onChange={(e) => handleStageChange(c.id, e.target.value as Candidate["stage"])}
                    className="text-[11px] font-medium bg-[#fafafa] border border-[#ebebeb] rounded-md px-2 py-1 text-neutral-700 cursor-pointer focus:outline-none focus:border-neutral-900"
                  >
                    <option value="Review">Review</option>
                    <option value="Interview">Interview</option>
                    <option value="Offer">Offer</option>
                    <option value="Hired">Hired</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
