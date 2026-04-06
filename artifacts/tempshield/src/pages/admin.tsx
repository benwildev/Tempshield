import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useAdminGetStats, useAdminGetUsers, useAdminGetUpgradeRequests,
  useAdminUpdateUpgradeRequest, useAdminSyncDomains, useAdminUpdateUserPlan,
  UpdatePlanRequestPlan, useAdminGetRevenue,
} from "@workspace/api-client-react";
import {
  useAdminGetPlanConfig, useAdminUpdatePlanConfig, useAdminCreatePlanConfig,
  useAdminDeletePlanConfig, useAdminGetApiKeys,
  useAdminDeleteUser, useAdminResetUsage, useAdminRevokeKey,
} from "@workspace/api-client-react";
import type { PlanConfig, AdminUserFull } from "@workspace/api-client-react";
import {
  LayoutDashboard, Users, CreditCard, Settings, Key, Database,
  Shield, RefreshCw, Check, X, Loader2, Trash2, RotateCcw,
  Search, ChevronLeft, ChevronRight, LogOut, ArrowLeft,
  PieChart, BarChart3, Globe, FileText, Zap, Lock, Plus, Mail, Send,
  Upload, Download, Paperclip, TrendingUp, DollarSign, Image, Tag,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";

type Section = "overview" | "users" | "subscriptions" | "plan-config" | "api-keys" | "domains" | "payment" | "email" | "revenue" | "branding" | "seo";

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "revenue", label: "Revenue", icon: TrendingUp },
  { id: "plan-config", label: "Plan Config", icon: Settings },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "domains", label: "Domain DB", icon: Database },
  { id: "payment", label: "Payment", icon: Globe },
  { id: "email", label: "Email", icon: Mail },
  { id: "branding", label: "Branding", icon: Image },
  { id: "seo", label: "SEO", icon: Tag },
];

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-muted/60 text-muted-foreground",
  BASIC: "bg-blue-500/15 text-blue-400",
  PRO: "bg-primary/15 text-primary",
};

function Sidebar({ active, onNav, collapsed, onToggle }: {
  active: Section;
  onNav: (s: Section) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`flex flex-col h-full bg-card border-r border-border transition-all duration-300 ${collapsed ? "w-16" : "w-56"}`}>
      <div className="flex items-center justify-between px-3 py-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading text-sm font-bold text-foreground truncate">Admin Portal</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all ${
              active === id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            } ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? label : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-border space-y-0.5">
        {collapsed ? (
          <button onClick={onToggle} className="w-full flex justify-center p-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <Link href="/dashboard" className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-heading text-2xl font-bold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function OverviewSection() {
  const statsQuery = useAdminGetStats();
  const stats = statsQuery.data;

  const planData = stats ? [
    { label: "Free", count: stats.usersByPlan?.FREE || 0, color: "bg-muted-foreground" },
    { label: "Basic", count: stats.usersByPlan?.BASIC || 0, color: "bg-blue-400" },
    { label: "Pro", count: stats.usersByPlan?.PRO || 0, color: "bg-primary" },
  ] : [];
  const totalForBar = planData.reduce((a, b) => a + (b.count || 0), 0) || 1;

  return (
    <div>
      <SectionHeader title="Overview" subtitle="Platform-wide statistics at a glance" />

      {statsQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Users", val: stats.totalUsers, icon: Users },
              { label: "API Calls", val: stats.totalApiCalls.toLocaleString(), icon: BarChart3 },
              { label: "Known Domains", val: stats.totalDomains.toLocaleString(), icon: Database },
              { label: "Pending Upgrades", val: stats.pendingUpgradeRequests, icon: CreditCard },
            ].map(({ label, val, icon: Icon }, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className="glass-card rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </div>
                <div className="font-heading text-2xl font-bold text-foreground">{val}</div>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="glass-card rounded-xl p-6">
            <h3 className="font-heading text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" /> Users by Plan
            </h3>
            <div className="space-y-3">
              {planData.map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-12">{label}</span>
                  <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                    <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${(count / totalForBar) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-foreground w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}

function UsersSection() {
  const qc = useQueryClient();
  const usersQuery = useAdminGetUsers();
  const updatePlanMutation = useAdminUpdateUserPlan();
  const deleteUserMutation = useAdminDeleteUser();
  const resetUsageMutation = useAdminResetUsage();
  const revokeKeyMutation = useAdminRevokeKey();
  const [search, setSearch] = useState("");
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});

  const users = (usersQuery.data?.users || []).filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const setLoading = (key: string, val: boolean) => setLoadingIds(p => ({ ...p, [key]: val }));

  const handlePlan = async (id: number, plan: string) => {
    const planValue = UpdatePlanRequestPlan[plan as keyof typeof UpdatePlanRequestPlan];
    if (!planValue) return;
    setLoading(`plan-${id}`, true);
    try {
      await updatePlanMutation.mutateAsync({ userId: id, data: { plan: planValue } });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } finally { setLoading(`plan-${id}`, false); }
  };

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    setLoading(`del-${id}`, true);
    try {
      await deleteUserMutation.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } finally { setLoading(`del-${id}`, false); }
  };

  const handleReset = async (id: number) => {
    setLoading(`reset-${id}`, true);
    try {
      await resetUsageMutation.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } finally { setLoading(`reset-${id}`, false); }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Revoke this API key? The user will need to get a new key.")) return;
    setLoading(`revoke-${id}`, true);
    try {
      await revokeKeyMutation.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } finally { setLoading(`revoke-${id}`, false); }
  };

  return (
    <div>
      <SectionHeader title="Users" subtitle="Manage all registered users" />
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text" placeholder="Search by name or email…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
        />
      </div>
      <div className="glass-card rounded-xl overflow-hidden">
        {usersQuery.isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-border">
                <tr>
                  {["Name / Email", "Plan", "Usage", "Bulk Jobs", "Joined", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No users found.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.plan}
                        onChange={e => handlePlan(u.id, e.target.value)}
                        disabled={loadingIds[`plan-${u.id}`]}
                        className={`text-xs font-bold rounded-md px-2 py-1 border border-border bg-background cursor-pointer ${PLAN_COLORS[u.plan]}`}
                      >
                        <option value="FREE">FREE</option>
                        <option value="BASIC">BASIC</option>
                        <option value="PRO">PRO</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {u.requestCount} / {u.requestLimit}
                      <div className="mt-1 h-1 w-20 rounded-full bg-border overflow-hidden">
                        <div className="h-1 rounded-full bg-primary" style={{ width: `${Math.min(100, (u.requestCount / u.requestLimit) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(u as AdminUserFull & { bulkJobCount?: number }).bulkJobCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{format(parseISO(u.createdAt), "PP")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleReset(u.id)} disabled={loadingIds[`reset-${u.id}`]}
                          title="Reset usage" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          {loadingIds[`reset-${u.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleRevoke(u.id)} disabled={loadingIds[`revoke-${u.id}`]}
                          title="Revoke API key" className="p-1.5 rounded-lg text-muted-foreground hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                          {loadingIds[`revoke-${u.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleDelete(u.id, u.email)} disabled={loadingIds[`del-${u.id}`]}
                          title="Delete user" className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          {loadingIds[`del-${u.id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type UpgradeRequestWithInvoice = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  planRequested: string;
  status: string;
  note?: string;
  hasInvoice: boolean;
  invoiceFileName?: string | null;
  invoiceUploadedAt?: string | null;
  createdAt: string;
};

async function requestInvoiceUploadUrl(requestId: number): Promise<{ uploadURL: string; objectPath: string }> {
  const resp = await fetch(`/api/admin/upgrade-requests/${requestId}/invoice/upload-url`, {
    method: "POST",
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Failed to get upload URL");
  return resp.json();
}

async function uploadToGcs(uploadURL: string, file: File): Promise<void> {
  const resp = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!resp.ok) throw new Error("Upload to storage failed");
}

async function attachInvoice(requestId: number, objectPath: string, fileName: string): Promise<void> {
  const resp = await fetch(`/api/admin/upgrade-requests/${requestId}/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ objectPath, fileName }),
  });
  if (!resp.ok) throw new Error("Failed to attach invoice");
}

function SubscriptionsSection() {
  const qc = useQueryClient();
  const requestsQuery = useAdminGetUpgradeRequests();
  const updateMutation = useAdminUpdateUpgradeRequest();
  const [tab, setTab] = useState<"PENDING" | "ALL">("PENDING");

  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [approveFile, setApproveFile] = useState<File | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approveUploading, setApproveUploading] = useState(false);
  const [approveError, setApproveError] = useState("");

  const [attachingId, setAttachingId] = useState<number | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState("");

  const requests = ((requestsQuery.data?.requests || []) as UpgradeRequestWithInvoice[]).filter(r =>
    tab === "PENDING" ? r.status === "PENDING" : true
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/upgrade-requests"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };

  const handleReject = async (id: number) => {
    await updateMutation.mutateAsync({ requestId: id, data: { status: "REJECTED" } });
    invalidate();
  };

  const handleApprove = async () => {
    if (!approvingId) return;
    setApproveUploading(true);
    setApproveError("");
    try {
      const updateData: { status: "APPROVED"; note?: string } = { status: "APPROVED" };
      if (approveNote.trim()) updateData.note = approveNote.trim();
      await updateMutation.mutateAsync({ requestId: approvingId, data: updateData });
      if (approveFile) {
        const { uploadURL, objectPath } = await requestInvoiceUploadUrl(approvingId);
        await uploadToGcs(uploadURL, approveFile);
        await attachInvoice(approvingId, objectPath, approveFile.name);
      }
      invalidate();
      setApprovingId(null);
      setApproveFile(null);
      setApproveNote("");
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setApproveUploading(false);
    }
  };

  const handleAttachInvoice = async () => {
    if (!attachingId || !attachFile) return;
    setAttachUploading(true);
    setAttachError("");
    try {
      const { uploadURL, objectPath } = await requestInvoiceUploadUrl(attachingId);
      await uploadToGcs(uploadURL, attachFile);
      await attachInvoice(attachingId, objectPath, attachFile.name);
      invalidate();
      setAttachingId(null);
      setAttachFile(null);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setAttachUploading(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Subscriptions" subtitle="Review and action upgrade requests" />

      {/* Approval Modal */}
      <AnimatePresence>
        {approvingId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setApprovingId(null); setApproveFile(null); setApproveNote(""); setApproveError(""); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-xl bg-green-500/15 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-400" />
                </div>
                <h3 className="font-heading text-base font-semibold text-foreground">Approve Upgrade Request</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                You can optionally attach an invoice PDF and add an admin note for this upgrade.
              </p>

              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Admin note (optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Upgraded to PRO — invoice #INV-2026-001"
                  value={approveNote}
                  onChange={e => setApproveNote(e.target.value)}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                />
              </div>

              <label className="block mb-4">
                <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Invoice (optional, PDF only, max 5 MB)</span>
                <div className={`relative flex items-center gap-2 border rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${approveFile ? "border-green-500/40 bg-green-500/5" : "border-border bg-muted/30 hover:border-primary/40"}`}>
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {approveFile ? approveFile.name : "Click to select a PDF…"}
                  </span>
                  {approveFile && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setApproveFile(null); }}
                      className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 5 * 1024 * 1024) { setApproveError("File must be under 5 MB"); return; }
                      setApproveFile(f ?? null);
                      setApproveError("");
                    }}
                  />
                </div>
              </label>

              {approveError && <p className="text-xs text-red-400 mb-3">{approveError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => { setApprovingId(null); setApproveFile(null); setApproveNote(""); setApproveError(""); }}
                  disabled={approveUploading}
                  className="flex-1 py-2 rounded-xl bg-muted/40 text-muted-foreground text-xs font-semibold hover:bg-muted/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveUploading}
                  className="flex-1 py-2 bg-green-500/15 text-green-400 hover:bg-green-500/25 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                >
                  {approveUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {approveUploading ? "Processing…" : "Approve"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attach Invoice Modal (for already-approved requests) */}
      <AnimatePresence>
        {attachingId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setAttachingId(null); setAttachFile(null); setAttachError(""); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-heading text-base font-semibold text-foreground">Attach Invoice</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Upload a PDF invoice for this approved request. The user will be able to download it from their dashboard.
              </p>

              <label className="block mb-4">
                <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Invoice PDF (max 5 MB)</span>
                <div className={`relative flex items-center gap-2 border rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${attachFile ? "border-green-500/40 bg-green-500/5" : "border-border bg-muted/30 hover:border-primary/40"}`}>
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {attachFile ? attachFile.name : "Click to select a PDF…"}
                  </span>
                  {attachFile && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAttachFile(null); }}
                      className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 5 * 1024 * 1024) { setAttachError("File must be under 5 MB"); return; }
                      setAttachFile(f ?? null);
                      setAttachError("");
                    }}
                  />
                </div>
              </label>

              {attachError && <p className="text-xs text-red-400 mb-3">{attachError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => { setAttachingId(null); setAttachFile(null); setAttachError(""); }}
                  disabled={attachUploading}
                  className="flex-1 py-2 rounded-xl bg-muted/40 text-muted-foreground text-xs font-semibold hover:bg-muted/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAttachInvoice}
                  disabled={attachUploading || !attachFile}
                  className="flex-1 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {attachUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {attachUploading ? "Uploading…" : "Upload Invoice"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 mb-5">
        {(["PENDING", "ALL"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
            {t === "PENDING" ? "Pending" : "All Requests"}
          </button>
        ))}
      </div>
      {requestsQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : requests.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted-foreground text-sm">
          {tab === "PENDING" ? "No pending upgrade requests." : "No requests yet."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map(req => (
            <div key={req.id} className="glass-card rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-semibold text-foreground text-sm">{req.userEmail}</div>
                  <div className="text-xs text-muted-foreground">{req.userName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{format(parseISO(req.createdAt), "PP pp")}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${PLAN_COLORS[req.planRequested]}`}>
                  → {req.planRequested}
                </span>
              </div>
              {req.note && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 mb-3 italic">"{req.note}"</p>
              )}
              {req.status === "PENDING" ? (
                <div className="flex gap-2">
                  <button onClick={() => { setApprovingId(req.id); setApproveFile(null); setApproveError(""); }} disabled={updateMutation.isPending}
                    className="flex-1 py-2 bg-green-500/15 text-green-400 hover:bg-green-500/25 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => handleReject(req.id)} disabled={updateMutation.isPending}
                    className="flex-1 py-2 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              ) : (
                <div>
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${req.status === "APPROVED" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                    {req.status}
                  </span>
                  {req.status === "APPROVED" && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      {req.hasInvoice ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-xs text-muted-foreground truncate">{req.invoiceFileName ?? "invoice.pdf"}</span>
                            </div>
                            {req.invoiceUploadedAt && (
                              <p className="text-xs text-muted-foreground/60 mt-0.5 pl-5">
                                {format(parseISO(req.invoiceUploadedAt), "PP")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={`/api/admin/upgrade-requests/${req.id}/invoice`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title="Download invoice"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={() => { setAttachingId(req.id); setAttachFile(null); setAttachError(""); }}
                              className="p-1 rounded-lg bg-muted/40 text-muted-foreground hover:bg-muted/60 transition-colors"
                              title="Replace invoice"
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAttachingId(req.id); setAttachFile(null); setAttachError(""); }}
                          className="w-full py-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          <Upload className="h-3.5 w-3.5" /> Attach Invoice
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BUILT_IN_PLANS = ["FREE", "BASIC", "PRO"];

const DEFAULT_NEW_PLAN = {
  requestLimit: 100,
  mxDetectLimit: 0,
  inboxCheckLimit: 0,
  websiteLimit: 0,
  pageLimit: 0,
  maxBulkEmails: 0,
  mxDetectionEnabled: false,
  inboxCheckEnabled: false,
  price: 0,
};

function PlanConfigSection() {
  const qc = useQueryClient();
  const configQuery = useAdminGetPlanConfig();
  const updateMutation = useAdminUpdatePlanConfig();
  const createMutation = useAdminCreatePlanConfig();
  const deleteMutation = useAdminDeletePlanConfig();

  const [editValues, setEditValues] = useState<Record<string, Partial<PlanConfig>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlan, setNewPlan] = useState({ plan: "", ...DEFAULT_NEW_PLAN });
  const [createError, setCreateError] = useState("");

  const configs = configQuery.data?.configs || [];

  const getValue = <K extends keyof PlanConfig>(plan: string, field: K, original: PlanConfig[K]): PlanConfig[K] => {
    const edits = editValues[plan];
    if (edits && field in edits) return edits[field] as PlanConfig[K];
    return original;
  };

  const setValue = (plan: string, field: keyof Partial<PlanConfig>, value: number | boolean) => {
    setEditValues(p => ({ ...p, [plan]: { ...p[plan], [field]: value } }));
  };

  const handleSave = async (plan: string) => {
    const updates = editValues[plan];
    if (!updates || Object.keys(updates).length === 0) return;
    setSaving(p => ({ ...p, [plan]: true }));
    try {
      await updateMutation.mutateAsync({ plan, data: updates });
      qc.invalidateQueries({ queryKey: ["/api/admin/plan-config"] });
      setEditValues(p => { const n = { ...p }; delete n[plan]; return n; });
      setSaved(p => ({ ...p, [plan]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [plan]: false })), 2000);
    } finally {
      setSaving(p => ({ ...p, [plan]: false }));
    }
  };

  const handleDelete = async (plan: string) => {
    if (!confirm(`Delete plan "${plan}"? This cannot be undone.`)) return;
    setDeleting(p => ({ ...p, [plan]: true }));
    try {
      await deleteMutation.mutateAsync(plan);
      qc.invalidateQueries({ queryKey: ["/api/admin/plan-config"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      alert(msg);
    } finally {
      setDeleting(p => ({ ...p, [plan]: false }));
    }
  };

  const handleCreate = async () => {
    setCreateError("");
    const planName = newPlan.plan.trim().toUpperCase();
    if (!planName || !/^[A-Z0-9_]+$/.test(planName)) {
      setCreateError("Plan name must be uppercase letters, numbers, or underscores (e.g. ENTERPRISE)");
      return;
    }
    try {
      await createMutation.mutateAsync({ ...newPlan, plan: planName });
      qc.invalidateQueries({ queryKey: ["/api/admin/plan-config"] });
      setNewPlan({ plan: "", ...DEFAULT_NEW_PLAN });
      setShowAddForm(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create plan");
    }
  };

  const planMeta: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    FREE: { label: "Free", color: "text-muted-foreground", icon: Shield },
    BASIC: { label: "Basic", color: "text-blue-400", icon: Zap },
    PRO: { label: "Pro", color: "text-primary", icon: Lock },
  };

  const numFields = [
    { key: "requestLimit" as const, label: "Request Limit" },
    { key: "mxDetectLimit" as const, label: "MX Detection Limit" },
    { key: "inboxCheckLimit" as const, label: "Inbox Check Limit" },
    { key: "websiteLimit" as const, label: "Website Limit" },
    { key: "pageLimit" as const, label: "Page Limit" },
    { key: "maxBulkEmails" as const, label: "Max Bulk Emails" },
  ];

  const boolFields = [
    { key: "mxDetectionEnabled" as const, label: "MX Detection" },
    { key: "inboxCheckEnabled" as const, label: "Inbox Check" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Plan Config</h2>
          <p className="text-sm text-muted-foreground mt-1">Adjust limits and features per subscription tier</p>
        </div>
        <button
          onClick={() => { setShowAddForm(p => !p); setCreateError(""); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl text-sm font-semibold transition-all flex-shrink-0 mt-1"
        >
          <Plus className="w-4 h-4" />
          Add Plan
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-card rounded-xl p-5 mb-6"
          >
            <h3 className="font-heading text-base font-semibold text-foreground mb-4">New Subscription Plan</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Plan Name <span className="text-muted-foreground/60">(uppercase, e.g. ENTERPRISE)</span></label>
                <input
                  type="text"
                  placeholder="ENTERPRISE"
                  value={newPlan.plan}
                  onChange={e => setNewPlan(p => ({ ...p, plan: e.target.value.toUpperCase() }))}
                  className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Price (USD/mo)</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-sm">$</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={newPlan.price}
                    onChange={e => setNewPlan(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
              </div>
              {numFields.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input
                    type="number"
                    value={newPlan[key]}
                    onChange={e => setNewPlan(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
              ))}
              {boolFields.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <button
                    type="button"
                    onClick={() => setNewPlan(p => ({ ...p, [key]: !p[key] }))}
                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${newPlan[key] ? "bg-primary" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${newPlan[key] ? "translate-x-4" : ""}`} />
                  </button>
                </div>
              ))}
            </div>
            {createError && <p className="text-xs text-red-400 mt-3">{createError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
              >
                {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Create Plan
              </button>
              <button
                onClick={() => { setShowAddForm(false); setCreateError(""); }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {configQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {configs.map(cfg => {
            const meta = planMeta[cfg.plan] || { label: cfg.plan, color: "text-orange-400", icon: Zap };
            const Icon = meta.icon;
            const hasChanges = !!(editValues[cfg.plan] && Object.keys(editValues[cfg.plan]).length > 0);
            const isBuiltIn = BUILT_IN_PLANS.includes(cfg.plan);
            return (
              <motion.div key={cfg.plan} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${meta.color}`} />
                    <h3 className={`font-heading text-lg font-bold ${meta.color}`}>{meta.label}</h3>
                  </div>
                  {!isBuiltIn && (
                    <button
                      onClick={() => handleDelete(cfg.plan)}
                      disabled={deleting[cfg.plan]}
                      title={`Delete ${cfg.plan} plan`}
                      className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      {deleting[cfg.plan] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Price (USD/mo)</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-sm">$</span>
                      <input
                        type="number" min={0} step={0.01}
                        value={getValue(cfg.plan, "price" as any, (cfg as any).price) as number}
                        onChange={e => setValue(cfg.plan, "price" as any, parseFloat(e.target.value) || 0)}
                        className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                  {numFields.map(({ key, label }) => {
                    const numVal = getValue(cfg.plan, key, cfg[key]) as number;
                    return (
                      <div key={key}>
                        <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                        <input
                          type="number"
                          value={numVal}
                          onChange={e => setValue(cfg.plan, key, parseInt(e.target.value) || 0)}
                          className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                    );
                  })}
                  {boolFields.map(({ key, label }) => {
                    const boolVal = getValue(cfg.plan, key, cfg[key]) as boolean;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <button
                          onClick={() => setValue(cfg.plan, key, !boolVal)}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${boolVal ? "bg-primary" : "bg-border"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${boolVal ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => handleSave(cfg.plan)}
                  disabled={!hasChanges || saving[cfg.plan]}
                  className={`mt-auto py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    saved[cfg.plan]
                      ? "bg-green-500/15 text-green-400"
                      : hasChanges
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : "bg-muted/30 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {saving[cfg.plan] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved[cfg.plan] ? <Check className="w-3.5 h-3.5" /> : null}
                  {saved[cfg.plan] ? "Saved!" : "Save Changes"}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApiKeysSection() {
  const qc = useQueryClient();
  const keysQuery = useAdminGetApiKeys();
  const revokeKeyMutation = useAdminRevokeKey();
  const [loadingIds, setLoadingIds] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");

  const keys = (keysQuery.data?.keys || []).filter(k =>
    k.email.toLowerCase().includes(search.toLowerCase()) ||
    k.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleRevoke = async (userId: number, email: string) => {
    if (!confirm(`Revoke API key for "${email}"?`)) return;
    setLoadingIds(p => ({ ...p, [userId]: true }));
    try {
      await revokeKeyMutation.mutateAsync(userId);
      qc.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
    } finally {
      setLoadingIds(p => ({ ...p, [userId]: false }));
    }
  };

  return (
    <div>
      <SectionHeader title="API Keys" subtitle="View and revoke user API keys" />
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all" />
      </div>
      <div className="glass-card rounded-xl overflow-hidden">
        {keysQuery.isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-border">
                <tr>
                  {["User", "Plan", "Masked Key", "Since", "Action"].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No keys found.</td></tr>
                ) : keys.map(k => (
                  <tr key={k.userId} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{k.name}</div>
                      <div className="text-xs text-muted-foreground">{k.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${PLAN_COLORS[k.plan]}`}>{k.plan}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.maskedKey}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{format(parseISO(k.createdAt), "PP")}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleRevoke(k.userId, k.email)} disabled={loadingIds[k.userId]}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                        {loadingIds[k.userId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DomainsSection() {
  const qc = useQueryClient();
  const statsQuery = useAdminGetStats();
  const syncMutation = useAdminSyncDomains();
  const [result, setResult] = useState<{ added: number; total: number } | null>(null);

  const handleSync = async () => {
    try {
      const data = await syncMutation.mutateAsync();
      setResult({ added: data.domainsAdded, total: data.totalDomains });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } catch {
      alert("Sync failed. Check server logs.");
    }
  };

  return (
    <div>
      <SectionHeader title="Domain Database" subtitle="Manage the disposable email domain blocklist" />
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Domains</span>
          </div>
          <div className="font-heading text-3xl font-bold text-foreground">
            {statsQuery.data?.totalDomains.toLocaleString() ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Disposable email domains in the blocklist</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-xl p-6">
          <h3 className="font-heading text-base font-semibold text-foreground mb-2">Sync from GitHub</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Pull the latest disposable domain list from the upstream GitHub repository.
          </p>
          <button onClick={handleSync} disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl text-sm font-semibold transition-all disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing…" : "Sync Now"}
          </button>
          {result && (
            <p className="text-xs text-green-400 mt-3">
              ✓ Added {result.added} domains — total: {result.total.toLocaleString()}
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ─── Payment Section ──────────────────────────────────────────────────────────

type PaymentGateway = "MANUAL" | "STRIPE" | "PAYPAL";

interface GatewayStatus {
  enabled: boolean;
  status: "ready" | "partial" | "unconfigured";
  message: string;
}

interface ConnectionStatus {
  manual: GatewayStatus;
  stripe: GatewayStatus;
  paypal: GatewayStatus;
}

interface PaymentSettingsData {
  gateway: PaymentGateway;
  stripeEnabled: boolean;
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  paypalEnabled: boolean;
  paypalClientId: string | null;
  paypalSecret: string | null;
  paypalMode: "sandbox" | "live";
  planPrices: Record<string, number>;
  freeVerifyLimit: number;
  updatedAt?: string;
  connectionStatus?: ConnectionStatus;
}

function useAdminPaymentSettings() {
  const [data, setData] = useState<PaymentSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/payment-settings", { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to load");
      setData(await resp.json());
    } catch {
      setError("Failed to load payment settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

function StatusBadge({ status, message }: { status: "ready" | "partial" | "unconfigured"; message: string }) {
  const styles = {
    ready: "bg-green-500/15 text-green-400 border-green-500/30",
    partial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    unconfigured: "bg-muted/40 text-muted-foreground border-border",
  };
  const labels = { ready: "Ready", partial: "Partial", unconfigured: "Not configured" };
  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[status]}`}>
        {labels[status]}
      </span>
      <span className="text-xs text-muted-foreground">{message}</span>
    </div>
  );
}

function PaymentSection() {
  const { data, loading, error, refetch } = useAdminPaymentSettings();
  const [form, setForm] = useState<Partial<PaymentSettingsData> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  React.useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const set = (key: keyof PaymentSettingsData, value: unknown) =>
    setForm(prev => prev ? { ...prev, [key]: value } : prev);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const resp = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error || "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refetch();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (error || !form) return (
    <div className="flex items-center gap-2 text-red-400">
      <X className="w-4 h-4" /> {error || "No data"}
    </div>
  );

  const gateway = form.gateway || "MANUAL";
  const cs = data?.connectionStatus;

  return (
    <div>
      <SectionHeader title="Payment Gateway" subtitle="Configure how users pay for upgrades" />

      {/* Gateway Status Overview */}
      {cs && (
        <div className="glass-card rounded-xl p-6 mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground mb-4">Connection Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Manual Approval</span>
              <StatusBadge status={cs.manual.status} message={cs.manual.message} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Stripe</span>
                <button
                  onClick={() => set("stripeEnabled", !form.stripeEnabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    form.stripeEnabled ? "bg-primary" : "bg-muted"
                  }`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    form.stripeEnabled ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
              </div>
              <StatusBadge status={cs.stripe.status} message={cs.stripe.message} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">PayPal</span>
                <button
                  onClick={() => set("paypalEnabled", !form.paypalEnabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    form.paypalEnabled ? "bg-primary" : "bg-muted"
                  }`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    form.paypalEnabled ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
              </div>
              <StatusBadge status={cs.paypal.status} message={cs.paypal.message} />
            </div>
          </div>
        </div>
      )}

      {/* Active Gateway selector */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-1">Active Gateway</h3>
        <p className="text-xs text-muted-foreground mb-4">Which gateway processes payments on the upgrade page</p>
        <div className="flex gap-3 flex-wrap">
          {(["MANUAL", "STRIPE", "PAYPAL"] as const).map(gw => (
            <button key={gw}
              onClick={() => set("gateway", gw)}
              className={`px-5 py-2 rounded-xl font-semibold text-sm transition-all border ${
                gateway === gw
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}>
              {gw === "MANUAL" ? "Manual" : gw === "STRIPE" ? "Stripe" : "PayPal"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {gateway === "MANUAL" && "Admins manually approve upgrade requests. No payment processing."}
          {gateway === "STRIPE" && "Users pay via Stripe Checkout. Webhooks auto-upgrade the account."}
          {gateway === "PAYPAL" && "Users pay via PayPal. Orders are captured and plan is upgraded instantly."}
        </p>
      </div>

      {/* Stripe Config */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Stripe Configuration
          </h3>
          {cs && <StatusBadge status={cs.stripe.status} message="" />}
        </div>
        <div className="space-y-4">
          {[
            { key: "stripePublishableKey", label: "Publishable Key", placeholder: "pk_live_...", type: "text" },
            { key: "stripeSecretKey", label: "Secret Key", placeholder: "sk_live_...", type: "password" },
            { key: "stripeWebhookSecret", label: "Webhook Secret", placeholder: "whsec_...", type: "password" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground font-medium block mb-1">{label}</label>
              <input
                type={type}
                value={(form[key as keyof typeof form] as string) || ""}
                onChange={e => set(key as keyof PaymentSettingsData, e.target.value || null)}
                placeholder={placeholder}
                className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Webhook URL: <code className="bg-background/70 px-1.5 py-0.5 rounded text-primary">/api/webhooks/stripe</code>
          </p>
        </div>
      </div>

      {/* PayPal Config */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> PayPal Configuration
          </h3>
          {cs && <StatusBadge status={cs.paypal.status} message="" />}
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Client ID</label>
            <input
              type="text"
              value={(form.paypalClientId as string) || ""}
              onChange={e => set("paypalClientId", e.target.value || null)}
              placeholder="AXxxxxxxx..."
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Secret</label>
            <input
              type="password"
              value={(form.paypalSecret as string) || ""}
              onChange={e => set("paypalSecret", e.target.value || null)}
              placeholder="EJxxxxxxx..."
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Mode</label>
            <div className="flex gap-3">
              {(["sandbox", "live"] as const).map(mode => (
                <button key={mode}
                  onClick={() => set("paypalMode", mode)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    form.paypalMode === mode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}>
                  {mode === "sandbox" ? "Sandbox" : "Live"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Free Verifier Limit */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-primary" /> Free Email Verifier
        </h3>
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">
            Free checks per session (0 to disable)
          </label>
          <input
            type="number"
            min={0}
            max={1000}
            value={form.freeVerifyLimit ?? 5}
            onChange={e => set("freeVerifyLimit", Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))}
            className="w-32 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Controls how many free checks anonymous visitors can run on the <code className="bg-background/70 px-1 py-0.5 rounded text-primary">/verify</code> page per 24-hour session.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && <span className="text-green-400 text-sm font-medium">✓ Saved</span>}
        {saveError && <span className="text-red-400 text-sm">{saveError}</span>}
        {data?.updatedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Last updated {format(parseISO(data.updatedAt), "MMM d, yyyy HH:mm")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Email Settings Section ───────────────────────────────────────────────────

interface EmailSettingsData {
  enabled: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpSecure: boolean;
  fromName: string;
  fromEmail: string | null;
  notifyOnSubmit: boolean;
  notifyOnDecision: boolean;
  adminEmail: string | null;
  updatedAt?: string;
  connectionStatus: "ready" | "configured" | "unconfigured";
}

function useEmailSettings() {
  const [data, setData] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/email-settings", { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to load");
      setData(await resp.json());
    } catch {
      setError("Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

function EmailSection() {
  const { data, loading, error, refetch } = useEmailSettings();
  const [form, setForm] = useState<Partial<EmailSettingsData> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  React.useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const set = (key: keyof EmailSettingsData, value: unknown) =>
    setForm(prev => prev ? { ...prev, [key]: value } : prev);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const resp = await fetch("/api/admin/email-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error || "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refetch();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch("/api/admin/email-settings/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const body = await resp.json();
      setTestResult({ ok: resp.ok, msg: body.message || body.error || "Unknown" });
    } catch {
      setTestResult({ ok: false, msg: "Request failed" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (error || !form) return (
    <div className="flex items-center gap-2 text-red-400">
      <X className="w-4 h-4" /> {error || "No data"}
    </div>
  );

  const statusColors = {
    ready: "bg-green-500/15 text-green-400 border-green-500/30",
    configured: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    unconfigured: "bg-muted/40 text-muted-foreground border-border",
  };
  const statusLabels = { ready: "Active", configured: "Configured (disabled)", unconfigured: "Not configured" };
  const cs = data?.connectionStatus || "unconfigured";

  return (
    <div>
      <SectionHeader title="Email Settings" subtitle="Configure SMTP to send upgrade request notifications" />

      {/* Status + Enable toggle */}
      <div className="glass-card rounded-xl p-6 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Email Notifications</p>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border mt-1 inline-block ${statusColors[cs]}`}>
              {statusLabels[cs]}
            </span>
          </div>
        </div>
        <button
          onClick={() => set("enabled", !form.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            form.enabled ? "bg-primary" : "bg-muted"
          }`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            form.enabled ? "translate-x-6" : "translate-x-1"
          }`} />
        </button>
      </div>

      {/* SMTP Configuration */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" /> SMTP Configuration
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground font-medium block mb-1">SMTP Host</label>
            <input
              type="text"
              value={form.smtpHost || ""}
              onChange={e => set("smtpHost", e.target.value || null)}
              placeholder="smtp.gmail.com"
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Port</label>
            <input
              type="number"
              value={form.smtpPort ?? 587}
              onChange={e => set("smtpPort", Number(e.target.value))}
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <button
              onClick={() => set("smtpSecure", !form.smtpSecure)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                form.smtpSecure ? "bg-primary" : "bg-muted"
              }`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                form.smtpSecure ? "translate-x-4" : "translate-x-1"
              }`} />
            </button>
            <span className="text-sm text-muted-foreground">TLS/SSL (port 465)</span>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Username</label>
            <input
              type="text"
              value={form.smtpUser || ""}
              onChange={e => set("smtpUser", e.target.value || null)}
              placeholder="you@gmail.com"
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Password / App Password</label>
            <input
              type="password"
              value={form.smtpPass || ""}
              onChange={e => set("smtpPass", e.target.value || null)}
              placeholder="••••••••"
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>

      {/* Sender + Recipients */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-4">Sender &amp; Recipients</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">From Name</label>
            <input
              type="text"
              value={form.fromName || ""}
              onChange={e => set("fromName", e.target.value)}
              placeholder="TempShield"
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">From Email</label>
            <input
              type="email"
              value={form.fromEmail || ""}
              onChange={e => set("fromEmail", e.target.value || null)}
              placeholder="noreply@yourdomain.com"
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground font-medium block mb-1">Admin Email (receives new request alerts)</label>
            <input
              type="email"
              value={form.adminEmail || ""}
              onChange={e => set("adminEmail", e.target.value || null)}
              placeholder="admin@yourdomain.com"
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>

      {/* Notification triggers */}
      <div className="glass-card rounded-xl p-6 mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-4">Notification Triggers</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => set("notifyOnSubmit", !form.notifyOnSubmit)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-0.5 ${
                form.notifyOnSubmit ? "bg-primary" : "bg-muted"
              }`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                form.notifyOnSubmit ? "translate-x-4" : "translate-x-1"
              }`} />
            </button>
            <div>
              <p className="text-sm font-medium text-foreground">On upgrade request submitted</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sends a confirmation to the user and an alert to the admin email.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <button
              onClick={() => set("notifyOnDecision", !form.notifyOnDecision)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-0.5 ${
                form.notifyOnDecision ? "bg-primary" : "bg-muted"
              }`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                form.notifyOnDecision ? "translate-x-4" : "translate-x-1"
              }`} />
            </button>
            <div>
              <p className="text-sm font-medium text-foreground">On upgrade approved / rejected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sends the user an email when their request is approved or rejected.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && <span className="text-green-400 text-sm font-medium">✓ Saved</span>}
        {saveError && <span className="text-red-400 text-sm">{saveError}</span>}
        {data?.updatedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Last updated {format(parseISO(data.updatedAt), "MMM d, yyyy HH:mm")}
          </span>
        )}
      </div>

      {/* Test email */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" /> Send Test Email
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Verify your SMTP settings by sending a test email. The connection is established live.
        </p>
        <div className="flex gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleTestEmail}
            disabled={testing || !testEmail}
            className="flex items-center gap-2 px-4 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl text-sm font-semibold transition-all disabled:opacity-60">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? "Sending…" : "Send"}
          </button>
        </div>
        {testResult && (
          <p className={`text-xs mt-3 font-medium ${testResult.ok ? "text-green-400" : "text-red-400"}`}>
            {testResult.ok ? "✓" : "✗"} {testResult.msg}
          </p>
        )}
      </div>
    </div>
  );
}

const PLAN_BAR_COLORS: Record<string, string> = {
  FREE: "hsl(var(--muted-foreground))",
  BASIC: "hsl(214 91% 60%)",
  PRO: "hsl(262 83% 58%)",
};

function RevenueSection() {
  const revenueQuery = useAdminGetRevenue();
  const data = revenueQuery.data;

  return (
    <div>
      <SectionHeader title="Revenue" subtitle="Earnings, subscriptions, and plan breakdown" />

      {revenueQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "Monthly Recurring Revenue",
                val: `$${data.mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                icon: DollarSign,
                color: "text-green-400",
                bg: "bg-green-500/10",
              },
              {
                label: "Total Paid Users",
                val: data.totalPaidUsers,
                icon: Users,
                color: "text-blue-400",
                bg: "bg-blue-500/10",
              },
              {
                label: "Plan Revenue Breakdown",
                val: data.revenueByPlan
                  .filter(r => r.plan !== "FREE" && r.userCount > 0)
                  .map(r => `${r.plan} $${r.revenue.toFixed(0)}`)
                  .join(" · ") || "—",
                icon: TrendingUp,
                color: "text-primary",
                bg: "bg-primary/10",
              },
            ].map(({ label, val, icon: Icon, color, bg }, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className="glass-card rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </div>
                <div className="font-heading text-2xl font-bold text-foreground">{val}</div>
              </motion.div>
            ))}
          </div>

          {/* Revenue by plan */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="glass-card rounded-xl p-6">
            <h3 className="font-heading text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" /> Revenue by Plan
            </h3>
            <div className="space-y-3">
              {data.revenueByPlan.map((row) => {
                const maxRevenue = Math.max(...data.revenueByPlan.map(r => r.revenue), 1);
                return (
                  <div key={row.plan} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">{row.plan}</span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${(row.revenue / maxRevenue) * 100}%`,
                          backgroundColor: PLAN_BAR_COLORS[row.plan] || "hsl(var(--primary))",
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                      {row.userCount} user{row.userCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs font-semibold text-foreground w-20 text-right shrink-0">
                      ${row.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Monthly subscriptions chart */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="glass-card rounded-xl p-6">
            <h3 className="font-heading text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> New Subscriptions — Last 12 Months
            </h3>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlySubs} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val: string) => {
                      const [year, month] = val.split("-");
                      return new Date(Number(year), Number(month) - 1).toLocaleString("default", { month: "short" });
                    }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      color: "hsl(var(--foreground))",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [value, "New subscriptions"]}
                    labelFormatter={(label: string) => {
                      const [year, month] = label.split("-");
                      return new Date(Number(year), Number(month) - 1).toLocaleString("default", { month: "long", year: "numeric" });
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.monthlySubs.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill="hsl(262 83% 58%)" fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Recent subscriptions table */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="glass-card rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="font-heading text-base font-semibold text-foreground">Recent Approved Subscriptions</h3>
            </div>
            {data.recent.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No approved subscriptions yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="border-b border-border">
                    <tr>
                      {["User", "Plan", "Price / mo", "Approved On"].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{row.userName}</div>
                          <div className="text-xs text-muted-foreground">{row.userEmail}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold rounded-md px-2 py-1 ${PLAN_COLORS[row.plan] || "bg-muted/60 text-muted-foreground"}`}>
                            {row.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">
                          ${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {row.approvedAt ? format(parseISO(row.approvedAt), "PP") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}

interface SiteSettingsData {
  siteTitle: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  globalMetaTitle: string;
  globalMetaDescription: string;
  footerText: string | null;
}

function BrandingSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<SiteSettingsData>({
    queryKey: ["/api/admin/site-settings"],
    queryFn: () => fetch("/api/admin/site-settings").then(r => r.json()),
  });

  const [form, setForm] = useState<SiteSettingsData>({
    siteTitle: "TempShield",
    tagline: "Block Fake Emails. Protect Your Platform.",
    logoUrl: null,
    faviconUrl: null,
    globalMetaTitle: "TempShield — Disposable Email Detection API",
    globalMetaDescription: "Industry-leading disposable email detection API. Real-time verification with 99.9% accuracy.",
    footerText: null,
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (data && !initialised.current) {
      initialised.current = true;
      setForm({
        siteTitle: data.siteTitle,
        tagline: data.tagline,
        logoUrl: data.logoUrl,
        faviconUrl: data.faviconUrl,
        globalMetaTitle: data.globalMetaTitle,
        globalMetaDescription: data.globalMetaDescription,
        footerText: data.footerText,
      });
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed to save");
      }
      qc.invalidateQueries({ queryKey: ["/api/admin/site-settings"] });
      qc.invalidateQueries({ queryKey: ["/api/site-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof SiteSettingsData, placeholder?: string, hint?: string, textarea?: boolean) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {textarea ? (
        <textarea
          value={(form[key] as string) ?? ""}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value || null }))}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        />
      ) : (
        <input
          type="text"
          value={(form[key] as string) ?? ""}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value || null }))}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div>
      <SectionHeader title="Branding" subtitle="Customise the site title, logo, favicon and footer" />
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="max-w-xl space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-6 space-y-5">
            <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" /> Site Identity
            </h3>
            {field("Site Title", "siteTitle", "TempShield", "Shown in the navbar and footer")}
            {field("Tagline", "tagline", "Block Fake Emails. Protect Your Platform.", "Short hero tagline (optional)", true)}
            {field("Logo URL", "logoUrl", "https://example.com/logo.png", "Link to your logo image — replaces the default Shield icon")}
            {field("Favicon URL", "faviconUrl", "https://example.com/favicon.ico", "Browser tab icon (ICO, PNG, or SVG)")}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="glass-card rounded-xl p-6 space-y-5">
            <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Global Meta Defaults
            </h3>
            {field("Default Meta Title", "globalMetaTitle", "TempShield — Disposable Email Detection API", "Used as the browser tab title on all pages")}
            {field("Default Meta Description", "globalMetaDescription", "", "Default SEO description for all pages", true)}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="glass-card rounded-xl p-6 space-y-5">
            <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Footer
            </h3>
            {field("Footer Text", "footerText", "Built for developers, by developers. © 2025 TempShield.", "Overrides the default footer copyright line. Leave blank to use the default.", true)}
          </motion.div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
            {saved ? "Saved!" : "Save Branding"}
          </button>
        </div>
      )}
    </div>
  );
}

const PAGE_SLUGS = [
  { slug: "/", label: "Home (Landing)" },
  { slug: "/pricing", label: "Pricing" },
  { slug: "/docs", label: "Documentation" },
  { slug: "/login", label: "Login" },
  { slug: "/signup", label: "Sign Up" },
];

interface PageSeoData {
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
}

function slugToPathParam(slug: string): string {
  if (slug === "/") return "home";
  return slug.replace(/^\//, "");
}

function PageSeoEditor({ slug, label }: { slug: string; label: string }) {
  const qc = useQueryClient();
  const slugParam = slugToPathParam(slug);
  const { data, isLoading } = useQuery<PageSeoData>({
    queryKey: [`/api/admin/site-settings/page/${slugParam}`],
    queryFn: () => fetch(`/api/admin/site-settings/page/${slugParam}`).then(r => r.json()),
  });

  const [form, setForm] = useState<Omit<PageSeoData, "slug">>({
    metaTitle: null,
    metaDescription: null,
    keywords: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (data && !initialised.current) {
      initialised.current = true;
      setForm({
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        ogImage: data.ogImage,
      });
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-settings/page/${slugParam}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed to save");
      }
      qc.invalidateQueries({ queryKey: [`/api/admin/site-settings/page/${slugParam}`] });
      qc.invalidateQueries({ queryKey: [`/api/site-settings/page?slug=${slug}`] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-muted/20">
        <Tag className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{slug}</span>
      </div>
      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Meta Title</label>
              <input
                type="text"
                value={form.metaTitle ?? ""}
                onChange={e => setForm(f => ({ ...f, metaTitle: e.target.value || null }))}
                placeholder="Page title for SEO (max 120 chars)"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Keywords</label>
              <input
                type="text"
                value={form.keywords ?? ""}
                onChange={e => setForm(f => ({ ...f, keywords: e.target.value || null }))}
                placeholder="comma, separated, keywords"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Meta Description</label>
            <textarea
              value={form.metaDescription ?? ""}
              onChange={e => setForm(f => ({ ...f, metaDescription: e.target.value || null }))}
              placeholder="Page description for search engines (max 320 chars)"
              rows={2}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">OG Title</label>
              <input
                type="text"
                value={form.ogTitle ?? ""}
                onChange={e => setForm(f => ({ ...f, ogTitle: e.target.value || null }))}
                placeholder="Open Graph title (social previews)"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">OG Image URL</label>
              <input
                type="text"
                value={form.ogImage ?? ""}
                onChange={e => setForm(f => ({ ...f, ogImage: e.target.value || null }))}
                placeholder="https://example.com/og-image.png"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">OG Description</label>
            <textarea
              value={form.ogDescription ?? ""}
              onChange={e => setForm(f => ({ ...f, ogDescription: e.target.value || null }))}
              placeholder="Open Graph description for social sharing"
              rows={2}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SeoSection() {
  return (
    <div>
      <SectionHeader title="SEO" subtitle="Per-page meta titles, descriptions, keywords and Open Graph tags" />
      <div className="space-y-4 max-w-3xl">
        {PAGE_SLUGS.map(({ slug, label }) => (
          <PageSeoEditor key={slug} slug={slug} label={label} />
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("overview");
  const [collapsed, setCollapsed] = useState(false);

  if (!user || user.role !== "ADMIN") return null;

  const sectionComponents: Record<Section, React.ReactNode> = {
    overview: <OverviewSection />,
    users: <UsersSection />,
    subscriptions: <SubscriptionsSection />,
    revenue: <RevenueSection />,
    "plan-config": <PlanConfigSection />,
    "api-keys": <ApiKeysSection />,
    domains: <DomainsSection />,
    payment: <PaymentSection />,
    email: <EmailSection />,
    branding: <BrandingSection />,
    seo: <SeoSection />,
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar active={section} onNav={setSection} collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {sectionComponents[section]}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
