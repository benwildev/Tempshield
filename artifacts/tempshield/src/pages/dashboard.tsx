import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar, PageTransition } from "@/components/Layout";
import {
  useGetDashboard,
  useRegenerateApiKey,
  type DashboardDataWithPlanConfig,
  type DashboardPlanConfig,
  useGetUserAnalytics,
  useGetUserAuditLog,
} from "@workspace/api-client-react";
import {
  useGetUserWebsites, useAddUserWebsite, useDeleteUserWebsite,
  useGetUserPages, useAddUserPage, useDeleteUserPage,
  useGetUserApiKeys, useCreateUserApiKey, useDeleteUserApiKey,
  useGetUserWebhooks, useCreateUserWebhook, useUpdateUserWebhook, useDeleteUserWebhook,
  useGetBlocklist, useAddBlocklistEntry, useDeleteBlocklistEntry,
} from "@workspace/api-client-react";
import {
  Copy, RefreshCw, Activity, ArrowUpRight, CheckCircle2, Key,
  BarChart3, Clock, Globe, FileText, Plus, Trash2, Loader2, X,
  Webhook, ShieldBan, Eye, EyeOff, Shield, AlertTriangle, ChevronDown,
  TrendingUp, ListFilter, ChevronLeft, ChevronRight, CreditCard, Download, Zap, Code,
} from "lucide-react";
import ReputationBadge from "@/components/ReputationBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import VerificationModal from "@/components/VerificationModal";

type Tab = "overview" | "analytics" | "keys" | "webhooks" | "blocklist" | "settings" | "audit" | "billing";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "error" in err) return String((err as { error: unknown }).error);
  return "An error occurred";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: rawData, isLoading } = useGetDashboard();
  const data = rawData as DashboardDataWithPlanConfig | undefined;
  const regenKeyMutation = useRegenerateApiKey();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (!user) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (confirm("Are you sure? Your old API key will stop working immediately.")) {
      await regenKeyMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: [`/api/user/dashboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auth/me`] });
    }
  };

  const usagePct = data
    ? Math.min(100, (data.user.requestCount / data.user.requestLimit) * 100)
    : 0;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "analytics", label: "Analytics", icon: TrendingUp },
    { id: "keys", label: "API Keys", icon: Key },
    { id: "webhooks", label: "Webhooks", icon: Webhook },
    { id: "blocklist", label: "Blocklist", icon: ShieldBan },
    { id: "audit", label: "Audit Log", icon: ListFilter },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "settings", label: "Settings", icon: Globe },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="max-w-6xl mx-auto px-6 w-full">
          <div className="flex justify-between items-end mb-6 mt-4">
            <div>
              <h1 className="font-heading text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground mt-1 text-sm">Welcome back, {user.name}</p>
            </div>
            <Link
              href="/upgrade"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Upgrade Plan <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-muted/30 rounded-xl p-1 flex-wrap">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Activity className="h-8 w-8 text-primary animate-pulse" />
            </div>
          ) : data ? (
            <>
              {activeTab === "overview" && (
                <OverviewTab
                  data={data}
                  usagePct={usagePct}
                  copied={copied}
                  onCopy={handleCopy}
                  onRegenerate={handleRegenerate}
                  regenPending={regenKeyMutation.isPending}
                />
              )}
              {activeTab === "analytics" && <AnalyticsTab data={data} usagePct={usagePct} />}
              {activeTab === "keys" && (
                <ApiKeysTab
                  plan={data.user.plan}
                  apiKey={data.user.apiKey}
                  copied={copied}
                  onCopy={handleCopy}
                  onRegenerate={handleRegenerate}
                  regenPending={regenKeyMutation.isPending}
                />
              )}
              {activeTab === "webhooks" && <WebhooksTab plan={data.user.plan} />}
              {activeTab === "blocklist" && <BlocklistTab />}
              {activeTab === "audit" && <AuditLogTab />}
              {activeTab === "billing" && <BillingTab />}
              {activeTab === "settings" && (
                <SettingsTab planConfig={data.planConfig} plan={data.user.plan} />
              )}
            </>
          ) : null}
        </div>
      </PageTransition>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  data, usagePct, copied, onCopy, onRegenerate, regenPending,
}: {
  data: DashboardDataWithPlanConfig;
  usagePct: number;
  copied: boolean;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  regenPending: boolean;
}) {
  const [verifyEmail, setVerifyEmail] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleVerify = async () => {
    if (!verifyEmail.trim()) return;
    setIsVerifying(true);
    try {
      const res = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail.trim() }),
      });
      const data = await res.json();
      setVerifyResult(data);
      setShowModal(true);
    } catch (err) {
      alert("Verification failed: " + (err instanceof Error ? err.message : "Network error"));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <VerificationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        result={verifyResult}
        email={verifyEmail}
      />
      {/* API Key Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6 lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Primary API Key</h2>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-border bg-muted/50 px-4 py-3 font-mono text-sm text-foreground/80 flex items-center overflow-x-auto">
            {data.user.apiKey}
          </div>
          <button onClick={() => onCopy(data.user.apiKey)}
            className="p-3 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy">
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
          <button onClick={onRegenerate} disabled={regenPending}
            className="p-3 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Regenerate">
            <RefreshCw className={`h-4 w-4 ${regenPending ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Include as{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-primary text-xs">Authorization: Bearer &lt;key&gt;</code>
          {" "}in your requests.
        </p>
      </motion.div>

      {/* Quick Verify Tool */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Quick Verify</h2>
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={verifyEmail}
            onChange={(e) => setVerifyEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="test@example.com"
            className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          <button
            onClick={handleVerify}
            disabled={isVerifying || !verifyEmail.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl transition-all hover:bg-primary/90 flex items-center gap-2 text-sm font-semibold disabled:opacity-50"
          >
            {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Perform a real-time MX and SMTP check for any email address.
        </p>
      </motion.div>

      {/* Usage Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold text-foreground">Usage</h2>
          </div>
          <span className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary uppercase tracking-wide">
            {data.user.plan}
          </span>
        </div>
        <div className="font-heading text-3xl font-bold text-foreground mb-1">
          {data.user.requestCount.toLocaleString()}
          <span className="text-base font-normal text-muted-foreground"> / {data.user.requestLimit.toLocaleString()}</span>
        </div>
        <div className="mt-4 h-2 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {(data.user.requestLimit - data.user.requestCount).toLocaleString()} requests remaining
        </p>
      </motion.div>

      {/* Stat Pills */}
      {data.counts && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-2xl p-5 lg:col-span-3">
          <div className="grid grid-cols-3 divide-x divide-border">
            {[
              { label: "Named API Keys", value: data.counts.namedApiKeys, icon: Key },
              { label: "Webhooks", value: data.counts.webhooks, icon: Webhook },
              { label: "Blocklisted Domains", value: data.counts.blocklist, icon: ShieldBan },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center gap-1 px-4 py-2">
                <Icon className="h-4 w-4 text-primary mb-1" />
                <span className="font-heading text-2xl font-bold text-foreground">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-2xl p-6 lg:col-span-3">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">API Calls — Last 30 Days</h2>
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={(data.usageByDay as { date: string; count: number }[])} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => format(parseISO(val), "MMM d")} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))", fontSize: "12px" }} />
              <Area type="monotone" dataKey="count" stroke="hsl(262 83% 58%)" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Audit Log preview */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-2xl p-6 lg:col-span-3 overflow-hidden">
        <div className="flex items-center gap-2 mb-6">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Recent Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border">
                {["Timestamp", "Email", "Domain", "Disposable", "Score", "Endpoint"].map(h => (
                  <th key={h} className="pb-3 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data.recentUsage || data.recentUsage.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No requests yet. Make your first API call!
                  </td>
                </tr>
              ) : (
                (data.recentUsage as Array<{ id: number; endpoint: string; email?: string | null; domain?: string | null; isDisposable?: boolean | null; reputationScore?: number | null; timestamp: string }>).map(entry => (
                  <tr key={entry.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 pr-4 text-foreground/70 text-xs whitespace-nowrap">{format(parseISO(entry.timestamp), "PP pp")}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-foreground/80 max-w-[160px] truncate">{entry.email ? maskEmail(entry.email) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{entry.domain ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 pr-4">
                      {entry.isDisposable == null ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : entry.isDisposable ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                          <AlertTriangle className="h-3 w-3" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                          <CheckCircle2 className="h-3 w-3" /> No
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {entry.reputationScore == null ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <ReputationBadge score={entry.reputationScore} />
                      )}
                    </td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{entry.endpoint}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}


// ─── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ data, usagePct }: { data: DashboardDataWithPlanConfig; usagePct: number }) {
  const plan = data.user.plan;
  const { data: analytics, isLoading } = useGetUserAnalytics({ query: { enabled: plan !== "FREE" } as any });

  const requestsRemaining = data.user.requestLimit - data.user.requestCount;

  // Plan Quota gauge — shown for all plans
  const quotaGauge = (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Plan Quota</h2>
        </div>
        <span className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary uppercase tracking-wide">
          {plan}
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-heading text-3xl font-bold text-foreground">{data.user.requestCount.toLocaleString()}</span>
        <span className="text-sm text-muted-foreground">/ {data.user.requestLimit.toLocaleString()} used</span>
      </div>
      <div className="h-3 w-full rounded-full bg-border overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-700 bg-gradient-to-r ${usagePct > 90 ? "from-red-500 to-red-600" : usagePct > 70 ? "from-yellow-500 to-orange-500" : "from-indigo-500 to-purple-500"}`}
          style={{ width: `${usagePct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {requestsRemaining.toLocaleString()} requests remaining this month
      </p>
    </motion.div>
  );

  // FREE plan — show upgrade wall
  if (plan === "FREE") {
    return (
      <div className="space-y-6">
        {quotaGauge}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Advanced Analytics</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Unlock detailed daily breakdowns, disposable detection rates, and top blocked domain rankings. Available on PRO.
          </p>
          <Link href="/upgrade" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            Upgrade to PRO <ArrowUpRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {quotaGauge}
        <div className="flex justify-center py-12"><Activity className="h-8 w-8 text-primary animate-pulse" /></div>
      </div>
    );
  }

  const isLimited = analytics?.limited === true;
  const dailyCalls = analytics?.dailyCalls ?? [];
  const disposableRate = analytics?.disposableRate ?? 0;
  const topDomains = analytics?.topBlockedDomains ?? [];
  const maxBarCount = topDomains.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div className="space-y-6">
      {/* BASIC plan: stat row limited to month total */}
      {!isLimited && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Calls This Month", value: analytics?.monthTotal.toLocaleString() ?? "0", color: "text-primary" },
            { label: "Total Checked", value: analytics?.totalChecked?.toLocaleString() ?? "0", color: "text-foreground" },
            { label: "Disposable Detected", value: analytics?.disposableCount?.toLocaleString() ?? "0", color: "text-red-400" },
            { label: "Detection Rate", value: `${disposableRate}%`, color: disposableRate > 50 ? "text-red-400" : disposableRate > 20 ? "text-yellow-400" : "text-green-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass-card rounded-2xl p-5 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className={`font-heading text-2xl font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </motion.div>
      )}

      {isLimited && (
        <>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Limited analytics — upgrade to PRO for full insights including disposable rate and top blocked domains.
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-4">
            {[
              { label: "Calls This Month", value: analytics?.monthTotal.toLocaleString() ?? "0", color: "text-primary" },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass-card rounded-2xl p-5 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={`font-heading text-2xl font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </motion.div>
        </>
      )}

      {quotaGauge}

      {/* Daily calls chart — BASIC + PRO */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Daily API Calls — Last 30 Days</h2>
        </div>
        {dailyCalls.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            No data yet. Make your first API call to see chart data.
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyCalls} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={val => format(parseISO(val), "MMM d")} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))", fontSize: "12px" }}
                  labelFormatter={v => format(parseISO(v), "PP")}
                />
                <Area type="monotone" dataKey="count" name="Calls" stroke="hsl(262 83% 58%)" strokeWidth={2} fillOpacity={1} fill="url(#analyticsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>

      {/* PRO-only: Top blocked domains + disposable rate */}
      {isLimited ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
          <ShieldBan className="h-8 w-8 text-primary/40" />
          <p className="text-sm font-medium text-foreground">Disposable rate &amp; top blocked domains</p>
          <p className="text-xs text-muted-foreground max-w-xs">These insights are available on the PRO plan.</p>
          <Link href="/upgrade" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors">
            Upgrade to PRO <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <ShieldBan className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold text-foreground">Top Blocked Domains</h2>
            <span className="text-xs text-muted-foreground">(all time)</span>
          </div>
          {topDomains.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No disposable emails detected yet.</p>
          ) : (
            <div className="space-y-3">
              {topDomains.map((d, i) => (
                <div key={d.domain} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">#{i + 1}</span>
                  <span className="font-mono text-sm text-foreground flex-1 truncate">{d.domain}</span>
                  <div className="w-32 h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-red-500 to-red-400"
                      style={{ width: `${Math.round((d.count / maxBarCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-red-400 w-8 text-right shrink-0">{d.count}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const limit = 50;
  const { data, isLoading, isFetching } = useGetUserAuditLog({ page, limit });

  const entries = data?.entries ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ListFilter className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold text-foreground">Audit Log</h2>
            {total > 0 && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {total.toLocaleString()} entries
              </span>
            )}
          </div>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border">
                    {["Timestamp", "Email", "Domain", "Disposable", "Score", "Endpoint"].map(h => (
                      <th key={h} className="pb-3 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                        No API calls logged yet. Make your first API request to see entries here.
                      </td>
                    </tr>
                  ) : (
                    entries.map(entry => (
                      <tr key={entry.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pr-4 text-foreground/70 text-xs whitespace-nowrap">
                          {format(parseISO(entry.timestamp), "PP pp")}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-foreground/80 max-w-[180px] truncate">
                          {entry.email ? maskEmail(entry.email) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {entry.domain ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 pr-4">
                          {entry.isDisposable == null ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : entry.isDisposable ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                              <AlertTriangle className="h-3 w-3" /> Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                              <CheckCircle2 className="h-3 w-3" /> No
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {entry.reputationScore == null ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <ReputationBadge score={entry.reputationScore} />
                          )}
                        </td>
                        <td className="py-3 font-mono text-xs text-muted-foreground">{entry.endpoint}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          p === page
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiKeysTab({
  plan, apiKey, copied, onCopy, onRegenerate, regenPending,
}: {
  plan: string;
  apiKey: string;
  copied: boolean;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  regenPending: boolean;
}) {
  const qc = useQueryClient();
  const keysQuery = useGetUserApiKeys();
  const createMutation = useCreateUserApiKey();
  const deleteMutation = useDeleteUserApiKey();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());
  const [newlyCreated, setNewlyCreated] = useState<{ id: number; key: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  const keys = keysQuery.data?.keys ?? [];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setError("");
    try {
      const res = await createMutation.mutateAsync(name.trim());
      setNewlyCreated({ id: res.key.id, key: res.key.key! });
      setName("");
      qc.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this API key? It will stop working immediately.")) return;
    await deleteMutation.mutateAsync(id);
    if (newlyCreated?.id === id) setNewlyCreated(null);
    qc.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
  };

  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReveal = (id: number) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const scriptSnippet = `<script\n  src="${typeof window !== "undefined" ? window.location.origin : ""}/temp-email-validator.js"\n  data-api-key="${apiKey}">\n</script>`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptSnippet);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Primary API Key */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Primary API Key</h2>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-border bg-muted/50 px-4 py-3 font-mono text-sm text-foreground/80 flex items-center overflow-x-auto">
            {apiKey}
          </div>
          <button onClick={() => onCopy(apiKey)}
            className="p-3 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy">
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
          <button onClick={onRegenerate} disabled={regenPending}
            className="p-3 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Regenerate">
            <RefreshCw className={`h-4 w-4 ${regenPending ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Include as{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-primary text-xs">Authorization: Bearer &lt;key&gt;</code>
          {" "}in your requests.
        </p>
      </motion.div>

      {/* Embed Script */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold text-foreground">Embed Script</h2>
          </div>
          <button
            onClick={handleCopyScript}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-xs font-medium"
          >
            {scriptCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {scriptCopied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Paste this before the closing <code className="rounded bg-muted px-1 py-0.5 text-primary text-xs">&lt;/body&gt;</code> tag on any page you want to protect.
        </p>
        <pre className="rounded-xl bg-muted/60 border border-border px-4 py-3 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre select-all">{scriptSnippet}</pre>
      </motion.div>

      {/* Named API Keys */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Key className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Named API Keys</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Create multiple named keys for different integrations. Each key is tied to your account quota.
          {plan === "FREE" ? (
            <span className="text-yellow-400"> Named keys require BASIC or PRO. <Link href="/upgrade" className="underline underline-offset-2">Upgrade your plan.</Link></span>
          ) : plan === "BASIC" ? (
            <span className="text-yellow-400"> BASIC allows 1 named key. Upgrade to PRO for up to 10.</span>
          ) : (
            <span> PRO plans support up to 10 named keys.</span>
          )}
        </p>

        {/* Create new key form — hidden for FREE */}
        {plan !== "FREE" && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Key name (e.g. production, staging)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
            <button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}
              className="px-4 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Create</>}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {/* Newly created key banner */}
        {newlyCreated && (
          <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <p className="text-xs font-medium text-green-400 mb-2">Key created — copy it now, it won't be shown again in full.</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 font-mono text-xs text-green-300 break-all">{newlyCreated.key}</code>
              <button onClick={() => handleCopy(newlyCreated.id, newlyCreated.key)}
                className="p-2 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors">
                {copiedId === newlyCreated.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setNewlyCreated(null)} className="p-2 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {keysQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : keys.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No named keys yet.</p>
        ) : (
          <ul className="space-y-2">
            {keys.map(k => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/50">
                <Key className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1">{k.name}</span>
                <code className="font-mono text-xs text-muted-foreground">
                  {k.maskedKey}
                </code>
                <button onClick={() => handleCopy(k.id, k.maskedKey)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                  {copiedId === k.id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => handleDelete(k.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}

// ─── Webhooks Tab ─────────────────────────────────────────────────────────────

function WebhooksTab({ plan }: { plan: string }) {
  const qc = useQueryClient();
  const hooksQuery = useGetUserWebhooks();
  const createMutation = useCreateUserWebhook();
  const updateMutation = useUpdateUserWebhook();
  const deleteMutation = useDeleteUserWebhook();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");

  const webhooks = hooksQuery.data?.webhooks ?? [];
  const canCreate = hooksQuery.data?.canCreate ?? (plan === "PRO");
  const isPro = plan === "PRO";

  const handleCreate = async () => {
    if (!url.trim()) return;
    setError("");
    try {
      await createMutation.mutateAsync({ url: url.trim(), secret: secret.trim() || undefined });
      setUrl(""); setSecret("");
      qc.invalidateQueries({ queryKey: ["/api/user/webhooks"] });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    await updateMutation.mutateAsync({ id, data: { enabled } });
    qc.invalidateQueries({ queryKey: ["/api/user/webhooks"] });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this webhook?")) return;
    await deleteMutation.mutateAsync(id);
    qc.invalidateQueries({ queryKey: ["/api/user/webhooks"] });
  };

  if (!isPro) {
    return (
      <div className="space-y-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Webhook className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Custom Integrations (Webhooks)</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Receive a signed HTTP POST to your endpoint every time a disposable email is detected. HMAC-SHA256 signed payloads, multiple endpoints, per-event filtering — all on PRO.
          </p>
          <Link href="/upgrade" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            Upgrade to PRO <ArrowUpRight className="h-4 w-4" />
          </Link>
        </motion.div>

        {/* Payload preview */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-6">
          <h3 className="font-heading text-sm font-semibold text-foreground mb-3">What you'll receive</h3>
          <pre className="bg-muted/50 rounded-xl p-4 text-xs font-mono text-foreground/80 overflow-x-auto">{`POST https://your-app.com/webhook
X-TempShield-Signature: sha256=<hmac-hex>

{
  "event": "email.detected",
  "email": "user@mailnull.com",
  "domain": "mailnull.com",
  "isDisposable": true,
  "reputationScore": 40,
  "timestamp": "2026-01-01T00:00:00.000Z"
}`}</pre>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Webhook className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Webhooks</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Receive a signed HTTP POST to your endpoint every time a disposable email is detected. We sign the payload with HMAC-SHA256 in the <code className="text-primary">X-TempShield-Signature</code> header.
        </p>

        {/* Create form — PRO only */}
        {canCreate && (
          <div className="space-y-3 mb-5">
            <input
              type="url"
              placeholder="https://your-app.com/webhook"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Secret (optional, for HMAC signature)"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <button onClick={handleCreate} disabled={createMutation.isPending || !url.trim()}
                className="px-4 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add</>}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {hooksQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : webhooks.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No webhooks configured.</p>
        ) : (
          <ul className="space-y-3">
            {webhooks.map(wh => (
              <li key={wh.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-foreground truncate">{wh.url}</p>
                  {wh.secret && (
                    <p className="text-xs text-muted-foreground mt-0.5">Secret: <code>{wh.secret}</code></p>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(wh.id, !wh.enabled)}
                  disabled={updateMutation.isPending}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${wh.enabled ? "bg-green-500/15 text-green-400 hover:bg-green-500/25" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                >
                  {wh.enabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => handleDelete(wh.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* Payload reference */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-6">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-3">Payload Format</h3>
        <pre className="bg-muted/50 rounded-xl p-4 text-xs font-mono text-foreground/80 overflow-x-auto">{`POST https://your-app.com/webhook
X-TempShield-Signature: sha256=<hmac-hex>

{
  "event": "email.detected",
  "email": "user@mailnull.com",
  "domain": "mailnull.com",
  "isDisposable": true,
  "reputationScore": 40,
  "timestamp": "2026-01-01T00:00:00.000Z"
}`}</pre>
      </motion.div>
    </div>
  );
}

// ─── Blocklist Tab ────────────────────────────────────────────────────────────

function BlocklistTab() {
  const qc = useQueryClient();
  const listQuery = useGetBlocklist();
  const addMutation = useAddBlocklistEntry();
  const deleteMutation = useDeleteBlocklistEntry();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const entries = listQuery.data?.entries ?? [];

  const handleAdd = async () => {
    if (!input.trim()) return;
    setError("");
    try {
      await addMutation.mutateAsync(input.trim().toLowerCase());
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/user/blocklist"] });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    qc.invalidateQueries({ queryKey: ["/api/user/blocklist"] });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldBan className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Custom Blocklist</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Add any domain to your personal blocklist. Emails from these domains will be flagged as disposable regardless of our global database.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="spam-domain.com"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          <button onClick={handleAdd} disabled={addMutation.isPending || !input.trim()}
            className="px-4 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50">
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Block</>}
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {listQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : entries.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No domains blocked yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map(e => (
              <li key={e.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <ShieldBan className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-sm font-mono text-foreground">{e.domain}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{format(parseISO(e.createdAt), "PP")}</span>
                  <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ planConfig, plan }: { planConfig?: DashboardPlanConfig; plan: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <WebsitesPanel planConfig={planConfig} plan={plan} />
      <PagesPanel planConfig={planConfig} plan={plan} />
    </div>
  );
}

function WebsitesPanel({ planConfig, plan }: { planConfig?: DashboardPlanConfig; plan: string }) {
  const qc = useQueryClient();
  const websitesQuery = useGetUserWebsites();
  const addMutation = useAddUserWebsite();
  const deleteMutation = useDeleteUserWebsite();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const websites = websitesQuery.data?.websites || [];
  const limit = planConfig?.websiteLimit ?? 0;

  const handleAdd = async () => {
    if (!input.trim()) return;
    setError("");
    try {
      await addMutation.mutateAsync(input.trim().toLowerCase());
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/user/websites"] });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    qc.invalidateQueries({ queryKey: ["/api/user/websites"] });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-base font-semibold text-foreground">Allowed Websites</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Domains that may use your API key.{" "}
        {limit > 0
          ? <span>{websites.length} / {limit} used</span>
          : <span className="text-yellow-400">Not available on your plan.</span>}
      </p>

      {limit > 0 && (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="example.com"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          <button onClick={handleAdd} disabled={addMutation.isPending || !input.trim()}
            className="px-3 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50">
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {websitesQuery.isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : websites.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          {plan === "FREE" ? "Upgrade your plan to add websites." : "No websites added yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {websites.map(w => (
            <li key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
              <span className="text-sm font-mono text-foreground">{w.domain}</span>
              <button onClick={() => handleDelete(w.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function PagesPanel({ planConfig, plan }: { planConfig?: DashboardPlanConfig; plan: string }) {
  const qc = useQueryClient();
  const pagesQuery = useGetUserPages();
  const addMutation = useAddUserPage();
  const deleteMutation = useDeleteUserPage();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const pages = pagesQuery.data?.pages || [];
  const limit = planConfig?.pageLimit ?? 0;

  const handleAdd = async () => {
    if (!input.trim()) return;
    const path = input.trim().startsWith("/") ? input.trim() : `/${input.trim()}`;
    setError("");
    try {
      await addMutation.mutateAsync(path);
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/user/pages"] });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    qc.invalidateQueries({ queryKey: ["/api/user/pages"] });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-base font-semibold text-foreground">Protected Pages</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        URL paths to protect with TempShield validation.{" "}
        {limit > 0
          ? <span>{pages.length} / {limit} used</span>
          : <span className="text-yellow-400">Not available on your plan.</span>}
      </p>

      {limit > 0 && (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="/signup"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          <button onClick={handleAdd} disabled={addMutation.isPending || !input.trim()}
            className="px-3 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-xl transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50">
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {pagesQuery.isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : pages.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          {plan === "FREE" ? "Upgrade your plan to add pages." : "No pages added yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {pages.map(p => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
              <span className="text-sm font-mono text-foreground">{p.path}</span>
              <button onClick={() => handleDelete(p.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

// ─── Billing Tab ───────────────────────────────────────────────────────────────

type BillingRequest = {
  id: number;
  planRequested: string;
  status: string;
  note?: string | null;
  hasInvoice: boolean;
  invoiceFileName?: string | null;
  invoiceUploadedAt?: string | null;
  createdAt: string;
};

function BillingTab() {
  const [billingData, setBillingData] = React.useState<{ requests: BillingRequest[] } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState("");

  React.useEffect(() => {
    fetch("/api/user/billing", { credentials: "include" })
      .then(r => r.json())
      .then(d => { setBillingData(d); setLoading(false); })
      .catch(() => { setFetchError("Failed to load billing history"); setLoading(false); });
  }, []);

  const PLAN_BADGE: Record<string, string> = {
    BASIC: "bg-blue-500/15 text-blue-400",
    PRO: "bg-primary/15 text-primary",
  };

  const STATUS_BADGE: Record<string, string> = {
    PENDING: "bg-yellow-500/15 text-yellow-400",
    APPROVED: "bg-green-500/15 text-green-400",
    REJECTED: "bg-red-500/15 text-red-400",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold text-foreground">Billing History</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Your subscription requests and any invoices attached to approved upgrades.
        </p>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : fetchError ? (
          <p className="text-center text-sm text-red-400 py-6">{fetchError}</p>
        ) : !billingData || billingData.requests.length === 0 ? (
          <div className="text-center py-10">
            <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No approved upgrades yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Invoices appear here once your upgrade request is approved.</p>
            <Link href="/upgrade" className="inline-flex items-center gap-1 mt-3 text-xs text-primary hover:underline">
              Request an upgrade <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {billingData.requests.map(req => (
              <div key={req.id} className="flex items-start justify-between gap-4 px-4 py-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${PLAN_BADGE[req.planRequested] ?? "bg-muted text-muted-foreground"}`}>
                      {req.planRequested}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_BADGE[req.status] ?? "bg-muted text-muted-foreground"}`}>
                      {req.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{format(parseISO(req.createdAt), "PP")}</span>
                  </div>
                  {req.note && (
                    <p className="text-xs text-muted-foreground italic mt-1 truncate">"{req.note}"</p>
                  )}
                  {req.hasInvoice && req.status === "APPROVED" && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-muted-foreground truncate">{req.invoiceFileName ?? "invoice.pdf"}</span>
                      {req.invoiceUploadedAt && (
                        <span className="text-xs text-muted-foreground">· {format(parseISO(req.invoiceUploadedAt), "PP")}</span>
                      )}
                    </div>
                  )}
                </div>
                {req.hasInvoice && req.status === "APPROVED" && (
                  <a
                    href={`/api/user/invoice/${req.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
                    title="Download Invoice"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Invoice
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
