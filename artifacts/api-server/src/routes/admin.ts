import { Router } from "express";
import { Readable } from "stream";
import { db, usersTable, apiUsageTable, domainsTable, upgradeRequestsTable, planConfigsTable, userWebsitesTable, userPagesTable, paymentSettingsTable } from "@workspace/db";
import { eq, sql, count, desc, and, gte } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middlewares/session.js";
import { syncDomainsFromGitHub } from "../lib/domain-cache.js";
import { getPlanConfig, generateApiKey } from "../lib/auth.js";
import { sendUpgradeDecisionNotification } from "../lib/email.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

const objectStorage = new ObjectStorageService();

const router = Router();

router.get("/users", requireAdmin, async (req, res) => {
  const users = await db
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
    .orderBy(usersTable.createdAt);

  res.json({
    users: users.map((u) => ({
      ...u,
      apiKey: u.apiKey.slice(0, 8) + "••••••••••••••••••••••••",
      createdAt: u.createdAt.toISOString(),
    })),
    total: users.length,
  });
});

const updatePlanSchema = z.object({
  plan: z.string().min(1).max(32),
  note: z.string().optional(),
});

router.patch("/users/:userId/plan", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId || "0");
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const result = updatePlanSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { plan } = result.data;

  const [planExists] = await db
    .select({ plan: planConfigsTable.plan })
    .from(planConfigsTable)
    .where(eq(planConfigsTable.plan, plan))
    .limit(1);

  if (!planExists) {
    res.status(400).json({ error: `Plan "${plan}" does not exist` });
    return;
  }

  const config = await getPlanConfig(plan);

  await db
    .update(usersTable)
    .set({ plan, requestLimit: config.requestLimit, requestCount: 0 })
    .where(eq(usersTable.id, userId));

  res.json({ message: `User plan updated to ${plan}` });
});

router.delete("/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId || "0");
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  await db.delete(apiUsageTable).where(eq(apiUsageTable.userId, userId));
  await db.delete(upgradeRequestsTable).where(eq(upgradeRequestsTable.userId, userId));
  await db.delete(userWebsitesTable).where(eq(userWebsitesTable.userId, userId));
  await db.delete(userPagesTable).where(eq(userPagesTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));

  res.json({ message: "User deleted" });
});

router.post("/users/:userId/reset-usage", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId || "0");
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  await db.update(usersTable).set({ requestCount: 0 }).where(eq(usersTable.id, userId));

  res.json({ message: "Usage reset to zero" });
});

router.post("/users/:userId/revoke-key", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId || "0");
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const newKey = generateApiKey();
  await db.update(usersTable).set({ apiKey: newKey }).where(eq(usersTable.id, userId));

  res.json({ message: "API key revoked and regenerated", apiKey: newKey.slice(0, 8) + "••••••••••••••••••••••••" });
});

router.get("/upgrade-requests", requireAdmin, async (req, res) => {
  const requests = await db
    .select({
      id: upgradeRequestsTable.id,
      userId: upgradeRequestsTable.userId,
      planRequested: upgradeRequestsTable.planRequested,
      status: upgradeRequestsTable.status,
      note: upgradeRequestsTable.note,
      invoiceKey: upgradeRequestsTable.invoiceKey,
      invoiceFileName: upgradeRequestsTable.invoiceFileName,
      invoiceUploadedAt: upgradeRequestsTable.invoiceUploadedAt,
      createdAt: upgradeRequestsTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(upgradeRequestsTable)
    .leftJoin(usersTable, eq(upgradeRequestsTable.userId, usersTable.id))
    .orderBy(upgradeRequestsTable.createdAt);

  res.json({
    requests: requests.map((r) => ({
      ...r,
      userName: r.userName || "Unknown",
      userEmail: r.userEmail || "Unknown",
      createdAt: r.createdAt.toISOString(),
      invoiceUploadedAt: r.invoiceUploadedAt ? r.invoiceUploadedAt.toISOString() : null,
      hasInvoice: !!r.invoiceKey,
    })),
    total: requests.length,
  });
});

router.post("/upgrade-requests/:requestId/invoice/upload-url", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.requestId || "0");
  if (isNaN(requestId) || requestId <= 0) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }

  const [upgradeReq] = await db
    .select({ id: upgradeRequestsTable.id })
    .from(upgradeRequestsTable)
    .where(eq(upgradeRequestsTable.id, requestId))
    .limit(1);

  if (!upgradeReq) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  try {
    const uploadURL = await objectStorage.getInvoiceUploadURL(requestId);
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err) {
    req.log.error({ err }, "Failed to generate invoice upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

const invoiceSchema = z.object({
  objectPath: z.string().startsWith("/objects/"),
  fileName: z.string().min(1).max(255),
});

router.post("/upgrade-requests/:requestId/invoice", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.requestId || "0");
  if (isNaN(requestId)) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }

  const result = invoiceSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "objectPath (must start with /objects/) and fileName are required" });
    return;
  }

  const { objectPath, fileName } = result.data;

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF files are accepted as invoices" });
    return;
  }

  const [upgradeReq] = await db
    .select({ id: upgradeRequestsTable.id, userId: upgradeRequestsTable.userId, status: upgradeRequestsTable.status })
    .from(upgradeRequestsTable)
    .where(eq(upgradeRequestsTable.id, requestId))
    .limit(1);

  if (!upgradeReq) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (upgradeReq.status !== "APPROVED") {
    res.status(400).json({ error: "Invoice can only be attached to approved upgrade requests" });
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    const contentType = (metadata.contentType as string) || "";
    const sizeBytes = Number(metadata.size) || 0;

    if (!contentType.startsWith("application/pdf") && !contentType.startsWith("application/octet-stream")) {
      res.status(400).json({ error: "Uploaded file must be a PDF (invalid content-type)" });
      return;
    }
    if (sizeBytes > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Invoice file must be under 5 MB" });
      return;
    }

    await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
      owner: String(upgradeReq.userId),
      visibility: "private",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to validate or set ACL on invoice object");
    res.status(500).json({ error: "Failed to attach invoice: storage error" });
    return;
  }

  await db
    .update(upgradeRequestsTable)
    .set({
      invoiceKey: objectPath,
      invoiceFileName: fileName,
      invoiceUploadedAt: new Date(),
    })
    .where(eq(upgradeRequestsTable.id, requestId));

  res.json({ message: "Invoice attached successfully" });
});

router.get("/upgrade-requests/:requestId/invoice", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.requestId || "0");
  if (isNaN(requestId)) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }

  const [upgradeReq] = await db
    .select({ invoiceKey: upgradeRequestsTable.invoiceKey, invoiceFileName: upgradeRequestsTable.invoiceFileName })
    .from(upgradeRequestsTable)
    .where(eq(upgradeRequestsTable.id, requestId))
    .limit(1);

  if (!upgradeReq) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (!upgradeReq.invoiceKey) {
    res.status(404).json({ error: "No invoice attached to this request" });
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(upgradeReq.invoiceKey);
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

const updateUpgradeSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().optional(),
});

router.patch("/upgrade-requests/:requestId", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.requestId || "0");
  if (isNaN(requestId)) {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }

  const result = updateUpgradeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { status, note } = result.data;

  const [upgradeReq] = await db
    .select()
    .from(upgradeRequestsTable)
    .where(eq(upgradeRequestsTable.id, requestId))
    .limit(1);

  if (!upgradeReq) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  await db
    .update(upgradeRequestsTable)
    .set({ status, note: note || upgradeReq.note })
    .where(eq(upgradeRequestsTable.id, requestId));

  if (status === "APPROVED") {
    const config = await getPlanConfig(upgradeReq.planRequested);
    await db
      .update(usersTable)
      .set({ plan: upgradeReq.planRequested, requestLimit: config.requestLimit, requestCount: 0 })
      .where(eq(usersTable.id, upgradeReq.userId));
  }

  // Fire-and-forget email notification to the user
  const [user] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, upgradeReq.userId))
    .limit(1);

  if (user) {
    sendUpgradeDecisionNotification({
      userEmail: user.email,
      userName: user.name,
      plan: upgradeReq.planRequested,
      status,
    }).catch(() => {});
  }

  res.json({ message: `Upgrade request ${status.toLowerCase()}` });
});

router.post("/domains/sync", requireAdmin, async (req, res) => {
  const { added, total } = await syncDomainsFromGitHub();
  res.json({
    message: "Domain sync completed",
    domainsAdded: added,
    totalDomains: total,
  });
});

router.get("/stats", requireAdmin, async (req, res) => {
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [totalApiCallsResult] = await db.select({ count: count() }).from(apiUsageTable);
  const [totalDomainsResult] = await db.select({ count: count() }).from(domainsTable);
  const [pendingResult] = await db
    .select({ count: count() })
    .from(upgradeRequestsTable)
    .where(eq(upgradeRequestsTable.status, "PENDING"));

  const planCounts = await db
    .select({ plan: usersTable.plan, count: count() })
    .from(usersTable)
    .groupBy(usersTable.plan);

  const usersByPlan: Record<string, number> = {};
  for (const row of planCounts) {
    usersByPlan[row.plan] = Number(row.count);
  }

  res.json({
    totalUsers: Number(totalUsersResult?.count || 0),
    totalApiCalls: Number(totalApiCallsResult?.count || 0),
    totalDomains: Number(totalDomainsResult?.count || 0),
    pendingUpgradeRequests: Number(pendingResult?.count || 0),
    usersByPlan,
  });
});

router.get("/plan-config", requireAdmin, async (req, res) => {
  const configs = await db.select().from(planConfigsTable).orderBy(planConfigsTable.id);
  res.json({ configs });
});

const createPlanConfigSchema = z.object({
  plan: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/, "Plan name must be uppercase letters, numbers, or underscores"),
  requestLimit: z.number().int().positive().default(100),
  mxDetectLimit: z.number().int().min(0).default(0),
  inboxCheckLimit: z.number().int().min(0).default(0),
  websiteLimit: z.number().int().min(0).default(0),
  pageLimit: z.number().int().min(0).default(0),
  mxDetectionEnabled: z.boolean().default(false),
  inboxCheckEnabled: z.boolean().default(false),
  price: z.number().min(0).default(0),
});

router.post("/plan-config", requireAdmin, async (req, res) => {
  const result = createPlanConfigSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.issues });
    return;
  }

  const { plan, ...rest } = result.data;

  const [existing] = await db
    .select({ plan: planConfigsTable.plan })
    .from(planConfigsTable)
    .where(eq(planConfigsTable.plan, plan))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: `Plan "${plan}" already exists` });
    return;
  }

  const [created] = await db
    .insert(planConfigsTable)
    .values({ plan, ...rest })
    .returning();

  res.status(201).json({ message: `Plan "${plan}" created`, config: created });
});

const updatePlanConfigSchema = z.object({
  requestLimit: z.number().int().positive().optional(),
  mxDetectLimit: z.number().int().min(0).optional(),
  inboxCheckLimit: z.number().int().min(0).optional(),
  websiteLimit: z.number().int().min(0).optional(),
  pageLimit: z.number().int().min(0).optional(),
  mxDetectionEnabled: z.boolean().optional(),
  inboxCheckEnabled: z.boolean().optional(),
  price: z.number().min(0).optional(),
});

router.patch("/plan-config/:plan", requireAdmin, async (req, res) => {
  const planName = req.params.plan?.toUpperCase();

  const [existing] = await db
    .select({ plan: planConfigsTable.plan })
    .from(planConfigsTable)
    .where(eq(planConfigsTable.plan, planName))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: `Plan "${planName}" not found` });
    return;
  }

  const result = updatePlanConfigSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.issues });
    return;
  }

  const updates = result.data;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  await db.update(planConfigsTable).set(updates).where(eq(planConfigsTable.plan, planName));

  if (updates.requestLimit !== undefined) {
    await db
      .update(usersTable)
      .set({ requestLimit: updates.requestLimit })
      .where(eq(usersTable.plan, planName));
  }

  const [updated] = await db.select().from(planConfigsTable).where(eq(planConfigsTable.plan, planName)).limit(1);
  res.json({ message: `Plan config for ${planName} updated`, config: updated });
});

const PROTECTED_PLANS = ["FREE", "BASIC", "PRO"];

router.delete("/plan-config/:plan", requireAdmin, async (req, res) => {
  const planName = req.params.plan?.toUpperCase();

  if (PROTECTED_PLANS.includes(planName)) {
    res.status(403).json({ error: `Built-in plan "${planName}" cannot be deleted` });
    return;
  }

  const [existing] = await db
    .select({ plan: planConfigsTable.plan })
    .from(planConfigsTable)
    .where(eq(planConfigsTable.plan, planName))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: `Plan "${planName}" not found` });
    return;
  }

  const [usersOnPlan] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.plan, planName));

  if (Number(usersOnPlan?.count) > 0) {
    res.status(409).json({ error: `Cannot delete plan — ${usersOnPlan.count} user(s) are currently on it` });
    return;
  }

  await db.delete(planConfigsTable).where(eq(planConfigsTable.plan, planName));

  res.json({ message: `Plan "${planName}" deleted` });
});

// ─── Payment Settings ─────────────────────────────────────────────────────────

function computeGatewayStatuses(settings: {
  stripeEnabled: boolean;
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  paypalEnabled: boolean;
  paypalClientId: string | null;
  paypalSecret: string | null;
}) {
  const stripeHasKeys = !!(settings.stripePublishableKey && settings.stripeSecretKey);
  const stripeHasWebhook = !!settings.stripeWebhookSecret;
  const paypalHasKeys = !!(settings.paypalClientId && settings.paypalSecret);

  return {
    manual: { enabled: true, status: "ready" as const, message: "Always available" },
    stripe: {
      enabled: settings.stripeEnabled,
      status: (settings.stripeEnabled && stripeHasKeys && stripeHasWebhook
        ? "ready"
        : settings.stripeEnabled && stripeHasKeys
          ? "partial"
          : "unconfigured") as "ready" | "partial" | "unconfigured",
      message: !stripeHasKeys
        ? "Missing publishable and secret keys"
        : !stripeHasWebhook
          ? "Missing webhook secret (plan auto-upgrade will not work)"
          : "Fully configured",
    },
    paypal: {
      enabled: settings.paypalEnabled,
      status: (settings.paypalEnabled && paypalHasKeys ? "ready" : "unconfigured") as "ready" | "unconfigured",
      message: !paypalHasKeys ? "Missing client ID or secret" : "Fully configured",
    },
  };
}

router.get("/payment-settings", requireAdmin, async (req, res) => {
  const [settings] = await db
    .select()
    .from(paymentSettingsTable)
    .where(eq(paymentSettingsTable.id, 1))
    .limit(1);

  const defaults = {
    gateway: "MANUAL",
    stripeEnabled: false,
    stripePublishableKey: null,
    stripeSecretKey: null,
    stripeWebhookSecret: null,
    paypalEnabled: false,
    paypalClientId: null,
    paypalSecret: null,
    paypalMode: "sandbox",
    planPrices: { BASIC: 9, PRO: 29 },
  };

  if (!settings) {
    res.json({ ...defaults, connectionStatus: computeGatewayStatuses(defaults as Parameters<typeof computeGatewayStatuses>[0]) });
    return;
  }

  res.json({
    gateway: settings.gateway,
    stripeEnabled: settings.stripeEnabled,
    stripePublishableKey: settings.stripePublishableKey || null,
    stripeSecretKey: settings.stripeSecretKey ? `${settings.stripeSecretKey.slice(0, 8)}••••••••` : null,
    stripeWebhookSecret: settings.stripeWebhookSecret ? `${settings.stripeWebhookSecret.slice(0, 8)}••••••••` : null,
    paypalEnabled: settings.paypalEnabled,
    paypalClientId: settings.paypalClientId || null,
    paypalSecret: settings.paypalSecret ? `${settings.paypalSecret.slice(0, 8)}••••••••` : null,
    paypalMode: settings.paypalMode,
    planPrices: settings.planPrices || { BASIC: 9, PRO: 29 },
    updatedAt: settings.updatedAt.toISOString(),
    connectionStatus: computeGatewayStatuses(settings),
  });
});

const updatePaymentSettingsSchema = z.object({
  gateway: z.enum(["MANUAL", "STRIPE", "PAYPAL"]).optional(),
  stripeEnabled: z.boolean().optional(),
  stripePublishableKey: z.string().optional().nullable(),
  stripeSecretKey: z.string().optional().nullable(),
  stripeWebhookSecret: z.string().optional().nullable(),
  paypalEnabled: z.boolean().optional(),
  paypalClientId: z.string().optional().nullable(),
  paypalSecret: z.string().optional().nullable(),
  paypalMode: z.enum(["sandbox", "live"]).optional(),
  planPrices: z.record(z.string(), z.number().positive()).optional(),
});

router.put("/payment-settings", requireAdmin, async (req, res) => {
  const result = updatePaymentSettingsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.issues });
    return;
  }

  const data = result.data;

  const [existing] = await db
    .select({ id: paymentSettingsTable.id, stripeSecretKey: paymentSettingsTable.stripeSecretKey, stripeWebhookSecret: paymentSettingsTable.stripeWebhookSecret, paypalSecret: paymentSettingsTable.paypalSecret })
    .from(paymentSettingsTable)
    .where(eq(paymentSettingsTable.id, 1))
    .limit(1);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.gateway !== undefined) updates.gateway = data.gateway;
  if (data.stripeEnabled !== undefined) updates.stripeEnabled = data.stripeEnabled;
  if (data.stripePublishableKey !== undefined) updates.stripePublishableKey = data.stripePublishableKey;
  if (data.paypalEnabled !== undefined) updates.paypalEnabled = data.paypalEnabled;
  if (data.paypalClientId !== undefined) updates.paypalClientId = data.paypalClientId;
  if (data.paypalMode !== undefined) updates.paypalMode = data.paypalMode;
  if (data.planPrices !== undefined) updates.planPrices = data.planPrices;

  // Only update secret fields if they don't contain the masked placeholder
  if (data.stripeSecretKey !== undefined && data.stripeSecretKey !== null && !data.stripeSecretKey.includes("••••••••")) {
    updates.stripeSecretKey = data.stripeSecretKey;
  } else if (data.stripeSecretKey === null) {
    updates.stripeSecretKey = null;
  }

  if (data.stripeWebhookSecret !== undefined && data.stripeWebhookSecret !== null && !data.stripeWebhookSecret.includes("••••••••")) {
    updates.stripeWebhookSecret = data.stripeWebhookSecret;
  } else if (data.stripeWebhookSecret === null) {
    updates.stripeWebhookSecret = null;
  }

  if (data.paypalSecret !== undefined && data.paypalSecret !== null && !data.paypalSecret.includes("••••••••")) {
    updates.paypalSecret = data.paypalSecret;
  } else if (data.paypalSecret === null) {
    updates.paypalSecret = null;
  }

  if (!existing) {
    await db.insert(paymentSettingsTable).values({
      gateway: (updates.gateway as string) || "MANUAL",
      stripeEnabled: (updates.stripeEnabled as boolean) ?? false,
      stripePublishableKey: (updates.stripePublishableKey as string | null) ?? null,
      stripeSecretKey: (updates.stripeSecretKey as string | null) ?? null,
      stripeWebhookSecret: (updates.stripeWebhookSecret as string | null) ?? null,
      paypalEnabled: (updates.paypalEnabled as boolean) ?? false,
      paypalClientId: (updates.paypalClientId as string | null) ?? null,
      paypalSecret: (updates.paypalSecret as string | null) ?? null,
      paypalMode: (updates.paypalMode as string) || "sandbox",
      planPrices: (updates.planPrices as Record<string, number>) || { BASIC: 9, PRO: 29 },
    });
  } else {
    await db.update(paymentSettingsTable).set(updates).where(eq(paymentSettingsTable.id, existing.id));
  }

  res.json({ message: "Payment settings updated" });
});

router.get("/api-keys", requireAdmin, async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      plan: usersTable.plan,
      apiKey: usersTable.apiKey,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json({
    keys: users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      plan: u.plan,
      maskedKey: u.apiKey.slice(0, 8) + "••••••••••••••••••••••••",
      createdAt: u.createdAt.toISOString(),
    })),
    total: users.length,
  });
});

router.get("/revenue", requireAdmin, async (req, res) => {
  const planConfigs = await db.select().from(planConfigsTable);
  const priceMap: Record<string, number> = {};
  for (const pc of planConfigs) {
    priceMap[pc.plan] = pc.price;
  }

  const planCounts = await db
    .select({ plan: usersTable.plan, count: count() })
    .from(usersTable)
    .groupBy(usersTable.plan);

  const userCountByPlan: Record<string, number> = {};
  for (const row of planCounts) {
    userCountByPlan[row.plan] = Number(row.count);
  }

  let mrr = 0;
  const revenueByPlan = planConfigs.map((pc) => {
    const userCount = userCountByPlan[pc.plan] || 0;
    const revenue = pc.price * userCount;
    if (pc.plan !== "FREE") mrr += revenue;
    return { plan: pc.plan, price: pc.price, userCount, revenue };
  });

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const monthlyRaw = await db
    .select({
      month: sql<string>`to_char(${upgradeRequestsTable.createdAt}, 'YYYY-MM')`,
      count: count(),
    })
    .from(upgradeRequestsTable)
    .where(and(
      eq(upgradeRequestsTable.status, "APPROVED"),
      gte(upgradeRequestsTable.createdAt, twelveMonthsAgo),
    ))
    .groupBy(sql`to_char(${upgradeRequestsTable.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${upgradeRequestsTable.createdAt}, 'YYYY-MM')`);

  const monthlyMap: Record<string, number> = {};
  for (const row of monthlyRaw) {
    monthlyMap[row.month] = Number(row.count);
  }

  const monthlySubs: { month: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlySubs.push({ month: key, count: monthlyMap[key] || 0 });
  }

  const recentRaw = await db
    .select({
      id: upgradeRequestsTable.id,
      userName: usersTable.name,
      userEmail: usersTable.email,
      plan: upgradeRequestsTable.planRequested,
      createdAt: upgradeRequestsTable.createdAt,
    })
    .from(upgradeRequestsTable)
    .leftJoin(usersTable, eq(upgradeRequestsTable.userId, usersTable.id))
    .where(eq(upgradeRequestsTable.status, "APPROVED"))
    .orderBy(desc(upgradeRequestsTable.createdAt))
    .limit(20);

  const recent = recentRaw.map((r) => ({
    id: r.id,
    userName: r.userName || "Unknown",
    userEmail: r.userEmail || "Unknown",
    plan: r.plan,
    price: priceMap[r.plan] || 0,
    createdAt: r.createdAt.toISOString(),
  }));

  const totalPaidUsers = planCounts
    .filter((r) => r.plan !== "FREE")
    .reduce((a, b) => a + Number(b.count), 0);

  res.json({ mrr, totalPaidUsers, revenueByPlan, monthlySubs, recent });
});

export default router;
