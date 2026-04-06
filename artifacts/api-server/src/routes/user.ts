import { Router } from "express";
import { Readable } from "stream";
import {
  db,
  usersTable,
  apiUsageTable,
  upgradeRequestsTable,
  userWebsitesTable,
  userPagesTable,
  planConfigsTable,
  userApiKeysTable,
  webhooksTable,
  customBlocklistTable,
} from "@workspace/db";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { z } from "zod";
import { generateApiKey, getPlanConfig } from "../lib/auth.js";
import { requireAuth } from "../middlewares/session.js";
import { sendUpgradeRequestNotification } from "../lib/email.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

const objectStorage = new ObjectStorageService();

const router = Router();

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/dashboard", requireAuth, async (req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      apiKey: usersTable.apiKey,
      role: usersTable.role,
      plan: usersTable.plan,
      requestCount: usersTable.requestCount,
      requestLimit: usersTable.requestLimit,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const recentUsage = await db
    .select({
      id: apiUsageTable.id,
      endpoint: apiUsageTable.endpoint,
      email: apiUsageTable.email,
      domain: apiUsageTable.domain,
      isDisposable: apiUsageTable.isDisposable,
      reputationScore: apiUsageTable.reputationScore,
      timestamp: apiUsageTable.timestamp,
    })
    .from(apiUsageTable)
    .where(eq(apiUsageTable.userId, req.userId!))
    .orderBy(desc(apiUsageTable.timestamp))
    .limit(10);

  const usageByDay = await db
    .select({
      date: sql<string>`DATE(${apiUsageTable.timestamp})::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(apiUsageTable)
    .where(eq(apiUsageTable.userId, req.userId!))
    .groupBy(sql`DATE(${apiUsageTable.timestamp})`)
    .orderBy(sql`DATE(${apiUsageTable.timestamp}) DESC`)
    .limit(30);

  const planConfig = await getPlanConfig(user.plan);

  // Named API key count
  const [{ keyCount }] = await db
    .select({ keyCount: count() })
    .from(userApiKeysTable)
    .where(eq(userApiKeysTable.userId, req.userId!));

  // Webhook count
  const [{ webhookCount }] = await db
    .select({ webhookCount: count() })
    .from(webhooksTable)
    .where(eq(webhooksTable.userId, req.userId!));

  // Blocklist count
  const [{ blocklistCount }] = await db
    .select({ blocklistCount: count() })
    .from(customBlocklistTable)
    .where(eq(customBlocklistTable.userId, req.userId!));

  res.json({
    user: { ...user, createdAt: user.createdAt.toISOString() },
    recentUsage: recentUsage.map((u) => ({ ...u, timestamp: u.timestamp.toISOString() })),
    usageByDay: usageByDay.map((u) => ({ date: u.date, count: Number(u.count) })),
    planConfig: {
      websiteLimit: planConfig.websiteLimit,
      pageLimit: planConfig.pageLimit,
      mxDetectionEnabled: planConfig.mxDetectionEnabled,
      inboxCheckEnabled: planConfig.inboxCheckEnabled,
      maxBulkEmails: planConfig.maxBulkEmails,
    },
    counts: {
      namedApiKeys: Number(keyCount),
      webhooks: Number(webhookCount),
      blocklist: Number(blocklistCount),
    },
  });
});

// ─── Primary API Key ──────────────────────────────────────────────────────────

router.post("/api-key/regenerate", requireAuth, async (req, res) => {
  const newKey = generateApiKey();

  await db
    .update(usersTable)
    .set({ apiKey: newKey })
    .where(eq(usersTable.id, req.userId!));

  res.json({ apiKey: newKey, message: "API key regenerated successfully" });
});

// ─── Named API Keys ───────────────────────────────────────────────────────────

const MAX_KEYS_PER_PLAN: Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PRO: 10,
};
const DEFAULT_MAX_KEYS = 10;

function getMaxApiKeys(plan: string): number {
  return MAX_KEYS_PER_PLAN[plan] ?? DEFAULT_MAX_KEYS;
}

router.get("/api-keys", requireAuth, async (req, res) => {
  const keys = await db
    .select({
      id: userApiKeysTable.id,
      name: userApiKeysTable.name,
      key: userApiKeysTable.key,
      createdAt: userApiKeysTable.createdAt,
    })
    .from(userApiKeysTable)
    .where(eq(userApiKeysTable.userId, req.userId!))
    .orderBy(userApiKeysTable.createdAt);

  res.json({
    keys: keys.map(({ key: _key, ...rest }) => ({
      ...rest,
      maskedKey: `${_key.slice(0, 6)}${"*".repeat(20)}`,
      createdAt: rest.createdAt.toISOString(),
    })),
    total: keys.length,
  });
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
});

router.post("/api-keys", requireAuth, async (req, res) => {
  const [user] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const maxKeys = getMaxApiKeys(user.plan);
  const [{ keyCount }] = await db
    .select({ keyCount: count() })
    .from(userApiKeysTable)
    .where(eq(userApiKeysTable.userId, req.userId!));

  if (Number(keyCount) >= maxKeys) {
    res.status(429).json({
      error: `API key limit reached (${maxKeys}) for your plan. Please upgrade to create more keys.`,
    });
    return;
  }

  const result = createApiKeySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Name is required (max 80 characters)" });
    return;
  }

  const { name } = result.data;
  const key = generateApiKey();

  const [inserted] = await db
    .insert(userApiKeysTable)
    .values({ userId: req.userId!, name, key })
    .returning();

  res.json({
    key: {
      id: inserted.id,
      name: inserted.name,
      key: inserted.key,
      maskedKey: `${inserted.key.slice(0, 6)}${"*".repeat(20)}`,
      createdAt: inserted.createdAt.toISOString(),
    },
    message: "API key created successfully",
  });
});

router.delete("/api-keys/:id", requireAuth, async (req: any, res: any) => {
  const id = parseInt(String(req.params.id || "0"));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [apiKey] = await db
    .select()
    .from(userApiKeysTable)
    .where(eq(userApiKeysTable.id, id))
    .limit(1);

  if (!apiKey || apiKey.userId !== req.userId) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  await db.delete(userApiKeysTable).where(eq(userApiKeysTable.id, id));
  res.json({ message: "API key deleted" });
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────

router.get("/webhooks", requireAuth, async (req, res) => {
  const plan = req.userPlan ?? "FREE";
  const canCreate = plan === "PRO";

  if (!canCreate) {
    res.json({ webhooks: [], total: 0, canCreate: false, planRequired: "PRO" });
    return;
  }

  const webhooks = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.userId, req.userId!))
    .orderBy(webhooksTable.createdAt);

  res.json({
    webhooks: webhooks.map((w) => ({
      ...w,
      secret: w.secret ? `${w.secret.slice(0, 4)}${"*".repeat(12)}` : null,
      createdAt: w.createdAt.toISOString(),
    })),
    total: webhooks.length,
    canCreate: true,
  });
});

const VALID_WEBHOOK_EVENTS = ["email.detected"] as const;

const createWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().max(256).optional(),
  enabled: z.boolean().optional(),
  events: z.array(z.enum(VALID_WEBHOOK_EVENTS)).optional(),
});

router.post("/webhooks", requireAuth, async (req, res) => {
  const plan = req.userPlan ?? "FREE";
  if (plan !== "PRO") {
    res.status(403).json({
      error: "Webhooks (Custom Integrations) are a PRO plan feature. Please upgrade to unlock.",
      planRequired: "PRO",
    });
    return;
  }

  const result = createWebhookSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid webhook URL" });
    return;
  }

  const { url, secret, enabled, events } = result.data;

  const [inserted] = await db
    .insert(webhooksTable)
    .values({
      userId: req.userId!,
      url,
      secret: secret ?? null,
      enabled: enabled ?? true,
      events: events ?? ["email.detected"],
    })
    .returning();

  res.json({
    webhook: {
      ...inserted,
      secret: inserted.secret ? `${inserted.secret.slice(0, 4)}${"*".repeat(12)}` : null,
      createdAt: inserted.createdAt.toISOString(),
    },
    message: "Webhook created",
  });
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().max(256).nullable().optional(),
  enabled: z.boolean().optional(),
  events: z.array(z.enum(VALID_WEBHOOK_EVENTS)).optional(),
});

router.patch("/webhooks/:id", requireAuth, async (req: any, res: any) => {
  const id = parseInt(String(req.params.id || "0"));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.id, id))
    .limit(1);

  if (!webhook || webhook.userId !== req.userId) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  const result = updateWebhookSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid update data" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (result.data.url !== undefined) updates.url = result.data.url;
  if (result.data.secret !== undefined) updates.secret = result.data.secret;
  if (result.data.enabled !== undefined) updates.enabled = result.data.enabled;
  if (result.data.events !== undefined) updates.events = result.data.events;

  const [updated] = await db
    .update(webhooksTable)
    .set(updates)
    .where(eq(webhooksTable.id, id))
    .returning();

  res.json({
    webhook: {
      ...updated,
      secret: updated.secret ? `${updated.secret.slice(0, 4)}${"*".repeat(12)}` : null,
      createdAt: updated.createdAt.toISOString(),
    },
    message: "Webhook updated",
  });
});

router.delete("/webhooks/:id", requireAuth, async (req: any, res: any) => {
  const id = parseInt(String(req.params.id || "0"));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.id, id))
    .limit(1);

  if (!webhook || webhook.userId !== req.userId) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
  res.json({ message: "Webhook deleted" });
});

// ─── Custom Blocklist ─────────────────────────────────────────────────────────

router.get("/blocklist", requireAuth, async (req, res) => {
  const entries = await db
    .select()
    .from(customBlocklistTable)
    .where(eq(customBlocklistTable.userId, req.userId!))
    .orderBy(customBlocklistTable.createdAt);

  res.json({
    entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    total: entries.length,
  });
});

const addBlocklistSchema = z.object({
  domain: z.string().min(1).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Invalid domain format"),
});

router.post("/blocklist", requireAuth, async (req, res) => {
  const plan = req.userPlan ?? "FREE";
  if (plan === "FREE") {
    res.status(403).json({
      error: "Custom blocklists are not available on the FREE plan. Upgrade to BASIC or PRO to manage your blocklist.",
      planRequired: "BASIC",
    });
    return;
  }

  const result = addBlocklistSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid domain format" });
    return;
  }

  // Normalize to lowercase so blocklist checks are consistent
  const domain = result.data.domain.toLowerCase();

  // Check for duplicate
  const [existing] = await db
    .select({ id: customBlocklistTable.id })
    .from(customBlocklistTable)
    .where(and(eq(customBlocklistTable.userId, req.userId!), eq(customBlocklistTable.domain, domain)))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Domain already in blocklist" });
    return;
  }

  const [inserted] = await db
    .insert(customBlocklistTable)
    .values({ userId: req.userId!, domain })
    .returning();

  res.json({
    entry: { ...inserted, createdAt: inserted.createdAt.toISOString() },
    message: "Domain added to blocklist",
  });
});

router.delete("/blocklist/:id", requireAuth, async (req: any, res: any) => {
  const id = parseInt(String(req.params.id || "0"));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [entry] = await db
    .select()
    .from(customBlocklistTable)
    .where(eq(customBlocklistTable.id, id))
    .limit(1);

  if (!entry || entry.userId !== req.userId) {
    res.status(404).json({ error: "Blocklist entry not found" });
    return;
  }

  await db.delete(customBlocklistTable).where(eq(customBlocklistTable.id, id));
  res.json({ message: "Domain removed from blocklist" });
});

// ─── Usage / Audit Log ────────────────────────────────────────────────────────

router.get("/usage", requireAuth, async (req, res) => {
  const entries = await db
    .select({
      id: apiUsageTable.id,
      endpoint: apiUsageTable.endpoint,
      email: apiUsageTable.email,
      domain: apiUsageTable.domain,
      isDisposable: apiUsageTable.isDisposable,
      reputationScore: apiUsageTable.reputationScore,
      timestamp: apiUsageTable.timestamp,
    })
    .from(apiUsageTable)
    .where(eq(apiUsageTable.userId, req.userId!))
    .orderBy(desc(apiUsageTable.timestamp))
    .limit(100);

  res.json({
    entries: entries.map((e) => ({ ...e, timestamp: e.timestamp.toISOString() })),
    total: entries.length,
  });
});

// ─── Audit Log (paginated) ────────────────────────────────────────────────────

router.get("/audit-log", requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"))));
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(apiUsageTable)
    .where(eq(apiUsageTable.userId, req.userId!));

  const entries = await db
    .select({
      id: apiUsageTable.id,
      endpoint: apiUsageTable.endpoint,
      email: apiUsageTable.email,
      domain: apiUsageTable.domain,
      isDisposable: apiUsageTable.isDisposable,
      reputationScore: apiUsageTable.reputationScore,
      timestamp: apiUsageTable.timestamp,
    })
    .from(apiUsageTable)
    .where(eq(apiUsageTable.userId, req.userId!))
    .orderBy(desc(apiUsageTable.timestamp))
    .limit(limit)
    .offset(offset);

  res.json({
    entries: entries.map((e) => ({ ...e, timestamp: e.timestamp.toISOString() })),
    page,
    limit,
    total: Number(total),
    totalPages: Math.ceil(Number(total) / limit),
  });
});

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get("/analytics", requireAuth, async (req, res) => {
  const plan = req.userPlan ?? "FREE";

  if (plan === "FREE") {
    res.status(403).json({
      error: "Advanced analytics is a PRO plan feature. Upgrade to unlock full insights.",
      planRequired: "PRO",
    });
    return;
  }

  // Daily call counts — last 30 days (BASIC + PRO)
  const dailyCalls = await db
    .select({
      date: sql<string>`DATE(${apiUsageTable.timestamp})::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.userId, req.userId!),
        sql`${apiUsageTable.timestamp} >= NOW() - INTERVAL '30 days'`
      )
    )
    .groupBy(sql`DATE(${apiUsageTable.timestamp})`)
    .orderBy(sql`DATE(${apiUsageTable.timestamp}) ASC`);

  // Total calls this month (BASIC + PRO)
  const [{ monthTotal }] = await db
    .select({ monthTotal: sql<number>`COUNT(*)::int` })
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.userId, req.userId!),
        sql`DATE_TRUNC('month', ${apiUsageTable.timestamp}) = DATE_TRUNC('month', NOW())`
      )
    );

  if (plan === "BASIC") {
    res.json({
      dailyCalls: dailyCalls.map((d) => ({ date: d.date, count: Number(d.count) })),
      monthTotal: Number(monthTotal),
      limited: true,
    });
    return;
  }

  // PRO only: disposable hit rate and top blocked domains
  const [{ totalChecks }] = await db
    .select({ totalChecks: sql<number>`COUNT(*)::int` })
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.userId, req.userId!),
        sql`${apiUsageTable.isDisposable} IS NOT NULL`
      )
    );

  const [{ disposableCount }] = await db
    .select({ disposableCount: sql<number>`COUNT(*)::int` })
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.userId, req.userId!),
        eq(apiUsageTable.isDisposable, true)
      )
    );

  const disposableRate = Number(totalChecks) > 0
    ? Math.round((Number(disposableCount) / Number(totalChecks)) * 100)
    : 0;

  const topBlockedDomains = await db
    .select({
      domain: apiUsageTable.domain,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.userId, req.userId!),
        eq(apiUsageTable.isDisposable, true),
        sql`${apiUsageTable.domain} IS NOT NULL`
      )
    )
    .groupBy(apiUsageTable.domain)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  res.json({
    dailyCalls: dailyCalls.map((d) => ({ date: d.date, count: Number(d.count) })),
    monthTotal: Number(monthTotal),
    disposableRate,
    disposableCount: Number(disposableCount),
    totalChecked: Number(totalChecks),
    topBlockedDomains: topBlockedDomains.map((d) => ({ domain: d.domain ?? "", count: Number(d.count) })),
    limited: false,
  });
});

// ─── Upgrade Request ──────────────────────────────────────────────────────────

const upgradeSchema = z.object({
  plan: z.string().min(1),
  note: z.string().optional(),
});

router.post("/upgrade", requireAuth, async (req, res) => {
  const result = upgradeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { plan, note } = result.data;

  await db.insert(upgradeRequestsTable).values({
    userId: req.userId!,
    planRequested: plan as any,
    note: note || null,
    status: "PENDING",
  });

  // Fire-and-forget email notifications (do not block the response)
  const [user] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (user) {
    sendUpgradeRequestNotification({
      userEmail: user.email,
      userName: user.name,
      plan,
      note: note || null,
    }).catch(() => {});
  }

  res.json({ message: "Upgrade request submitted successfully. We will review it shortly." });
});

// ─── Websites ─────────────────────────────────────────────────────────────────

router.get("/websites", requireAuth, async (req, res) => {
  const websites = await db
    .select()
    .from(userWebsitesTable)
    .where(eq(userWebsitesTable.userId, req.userId!))
    .orderBy(userWebsitesTable.createdAt);

  res.json({
    websites: websites.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
    total: websites.length,
  });
});

const addWebsiteSchema = z.object({
  domain: z.string().min(1).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Invalid domain format"),
});

router.post("/websites", requireAuth, async (req, res) => {
  const [user] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const planConfig = await getPlanConfig(user.plan);

  const [{ websiteCount }] = await db
    .select({ websiteCount: count() })
    .from(userWebsitesTable)
    .where(eq(userWebsitesTable.userId, req.userId!));

  if (planConfig.websiteLimit === 0) {
    res.status(403).json({
      error: "Website tracking is not available on your current plan. Please upgrade.",
    });
    return;
  }
  if (Number(websiteCount) >= planConfig.websiteLimit) {
    res.status(429).json({
      error: `Website limit reached (${planConfig.websiteLimit}). Please upgrade your plan.`,
    });
    return;
  }

  const result = addWebsiteSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid domain format" });
    return;
  }

  const { domain } = result.data;

  const allDomains = await db
    .select({ domain: userWebsitesTable.domain })
    .from(userWebsitesTable)
    .where(eq(userWebsitesTable.userId, req.userId!));

  if (allDomains.some((w) => w.domain === domain)) {
    res.status(409).json({ error: "Domain already added" });
    return;
  }

  const [inserted] = await db
    .insert(userWebsitesTable)
    .values({ userId: req.userId!, domain })
    .returning();

  res.json({
    website: { ...inserted, createdAt: inserted.createdAt.toISOString() },
    message: "Domain added",
  });
});

router.delete("/websites/:id", requireAuth, async (req: any, res: any) => {
  const id = parseInt(String(req.params.id || "0"));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [website] = await db
    .select()
    .from(userWebsitesTable)
    .where(eq(userWebsitesTable.id, id))
    .limit(1);

  if (!website || website.userId !== req.userId) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  await db.delete(userWebsitesTable).where(eq(userWebsitesTable.id, id));
  res.json({ message: "Domain removed" });
});

// ─── Pages ────────────────────────────────────────────────────────────────────

router.get("/pages", requireAuth, async (req, res) => {
  const pages = await db
    .select()
    .from(userPagesTable)
    .where(eq(userPagesTable.userId, req.userId!))
    .orderBy(userPagesTable.createdAt);

  res.json({
    pages: pages.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    total: pages.length,
  });
});

const addPageSchema = z.object({
  path: z.string().min(1).regex(/^\/.*/, "Path must start with /"),
});

router.post("/pages", requireAuth, async (req, res) => {
  const [user] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const planConfig = await getPlanConfig(user.plan);

  const [{ pageCount }] = await db
    .select({ pageCount: count() })
    .from(userPagesTable)
    .where(eq(userPagesTable.userId, req.userId!));

  if (planConfig.pageLimit === 0) {
    res.status(403).json({ error: "Page tracking is not available on your current plan. Please upgrade." });
    return;
  }
  if (Number(pageCount) >= planConfig.pageLimit) {
    res.status(429).json({
      error: `Page limit reached (${planConfig.pageLimit}). Please upgrade your plan.`,
    });
    return;
  }

  const result = addPageSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Path must start with /" });
    return;
  }

  const { path } = result.data;

  const allPaths = await db
    .select({ path: userPagesTable.path })
    .from(userPagesTable)
    .where(eq(userPagesTable.userId, req.userId!));

  if (allPaths.some((p) => p.path === path)) {
    res.status(409).json({ error: "Page path already added" });
    return;
  }

  const [inserted] = await db
    .insert(userPagesTable)
    .values({ userId: req.userId!, path })
    .returning();

  res.json({ page: { ...inserted, createdAt: inserted.createdAt.toISOString() }, message: "Page added" });
});

router.delete("/pages/:id", requireAuth, async (req: any, res: any) => {
  const id = parseInt(String(req.params.id || "0"));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [page] = await db
    .select()
    .from(userPagesTable)
    .where(eq(userPagesTable.id, id))
    .limit(1);

  if (!page || page.userId !== req.userId) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  await db.delete(userPagesTable).where(eq(userPagesTable.id, id));
  res.json({ message: "Page removed" });
});

// ─── Billing History ──────────────────────────────────────────────────────────

router.get("/billing", requireAuth, async (req, res) => {
  const requests = await db
    .select({
      id: upgradeRequestsTable.id,
      planRequested: upgradeRequestsTable.planRequested,
      status: upgradeRequestsTable.status,
      note: upgradeRequestsTable.note,
      invoiceFileName: upgradeRequestsTable.invoiceFileName,
      invoiceUploadedAt: upgradeRequestsTable.invoiceUploadedAt,
      hasInvoice: sql<boolean>`(${upgradeRequestsTable.invoiceKey} IS NOT NULL)`,
      createdAt: upgradeRequestsTable.createdAt,
    })
    .from(upgradeRequestsTable)
    .where(and(eq(upgradeRequestsTable.userId, req.userId!), eq(upgradeRequestsTable.status, "APPROVED")))
    .orderBy(desc(upgradeRequestsTable.createdAt));

  res.json({
    requests: requests.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      invoiceUploadedAt: r.invoiceUploadedAt ? r.invoiceUploadedAt.toISOString() : null,
    })),
    total: requests.length,
  });
});

router.get("/invoice/:requestId", requireAuth, async (req: any, res: any) => {
  const requestId = parseInt(String(req.params.requestId || "0"));
  if (isNaN(requestId)) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }

  const [upgradeReq] = await db
    .select({
      userId: upgradeRequestsTable.userId,
      invoiceKey: upgradeRequestsTable.invoiceKey,
      invoiceFileName: upgradeRequestsTable.invoiceFileName,
    })
    .from(upgradeRequestsTable)
    .where(eq(upgradeRequestsTable.id, requestId))
    .limit(1);

  if (!upgradeReq) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (upgradeReq.userId !== req.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!upgradeReq.invoiceKey) {
    res.status(404).json({ error: "No invoice attached to this request" });
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(upgradeReq.invoiceKey);

    const hasAccess = await objectStorage.canAccessObjectEntity({
      userId: String(req.userId),
      objectFile,
    });
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const response = await objectStorage.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (upgradeReq.invoiceFileName) {
      res.setHeader("Content-Disposition", `attachment; filename="${upgradeReq.invoiceFileName}"`);
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Invoice file not found in storage" });
      return;
    }
    res.status(500).json({ error: "Failed to serve invoice" });
  }
});

// ─── User Settings ────────────────────────────────────────────────────────────

router.get("/settings", requireAuth, async (req, res) => {
  const [user] = await db
    .select({ blockFreeEmails: usersTable.blockFreeEmails })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ blockFreeEmails: user.blockFreeEmails });
});

const updateSettingsSchema = z.object({
  blockFreeEmails: z.boolean(),
});

router.patch("/settings", requireAuth, async (req, res) => {
  const result = updateSettingsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid settings" });
    return;
  }

  await db
    .update(usersTable)
    .set({ blockFreeEmails: result.data.blockFreeEmails })
    .where(eq(usersTable.id, req.userId!));

  res.json({ blockFreeEmails: result.data.blockFreeEmails });
});

export default router;
