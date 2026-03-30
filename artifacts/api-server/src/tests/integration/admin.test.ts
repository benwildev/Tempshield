import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { db, usersTable, apiUsageTable, userApiKeysTable, webhooksTable, customBlocklistTable, upgradeRequestsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { hashPassword, generateApiKey } from "../../lib/auth.js";

let adminCookies: string[];

async function getAdminCookies() {
  if (adminCookies) return adminCookies;
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@tempshield.io", password: "admin123" });
  adminCookies = res.headers["set-cookie"] as string[];
  return adminCookies;
}

async function createRegularUser(suffix: string) {
  const email = `admin-test-${suffix}-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Regular User", email, password: "testpass123" });
  return { email, user: res.body.user, cookies: res.headers["set-cookie"] as string[] };
}

async function cleanupUser(email: string) {
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (!u) return;
  await db.delete(customBlocklistTable).where(eq(customBlocklistTable.userId, u.id));
  await db.delete(webhooksTable).where(eq(webhooksTable.userId, u.id));
  await db.delete(userApiKeysTable).where(eq(userApiKeysTable.userId, u.id));
  await db.delete(apiUsageTable).where(eq(apiUsageTable.userId, u.id));
  await db.delete(upgradeRequestsTable).where(eq(upgradeRequestsTable.userId, u.id));
  await db.delete(usersTable).where(eq(usersTable.id, u.id));
}

describe("GET /api/admin/users", () => {
  it("returns all users for admin", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .get("/api/admin/users")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.users).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThan(0);
    const admin = res.body.users.find((u: { email: string }) => u.email === "admin@tempshield.io");
    expect(admin).toBeDefined();
    expect(admin.role).toBe("ADMIN");
  });

  it("returns 403 for regular users", async () => {
    const t = await createRegularUser("forbidden");
    const res = await request(app)
      .get("/api/admin/users")
      .set("Cookie", t.cookies);
    expect(res.status).toBe(403);
    await cleanupUser(t.email);
  });

  it("returns 403 when not authenticated", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/users/:userId/plan", () => {
  let email: string;
  let userId: number;

  beforeEach(async () => {
    const t = await createRegularUser("plan-change");
    email = t.email;
    userId = t.user.id;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("updates a user plan", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/plan`)
      .set("Cookie", cookies)
      .send({ plan: "BASIC" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/BASIC/);
  });

  it("returns 400 for non-existent plan", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/plan`)
      .set("Cookie", cookies)
      .send({ plan: "NONEXISTENT_PLAN" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/users/:userId/reset-usage", () => {
  let email: string;
  let userId: number;

  beforeEach(async () => {
    const t = await createRegularUser("reset-usage");
    email = t.email;
    userId = t.user.id;
    await db.update(usersTable).set({ requestCount: 5 }).where(eq(usersTable.id, userId));
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("resets usage to zero", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .post(`/api/admin/users/${userId}/reset-usage`)
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    const [u] = await db.select({ requestCount: usersTable.requestCount }).from(usersTable).where(eq(usersTable.id, userId));
    expect(u.requestCount).toBe(0);
  });
});

describe("GET /api/admin/stats", () => {
  it("returns platform statistics", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .get("/api/admin/stats")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(typeof res.body.totalUsers).toBe("number");
    expect(typeof res.body.totalApiCalls).toBe("number");
    expect(typeof res.body.totalDomains).toBe("number");
    expect(typeof res.body.pendingUpgradeRequests).toBe("number");
    expect(res.body.usersByPlan).toBeDefined();
  });
});

describe("GET /api/admin/upgrade-requests", () => {
  it("returns upgrade requests list", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .get("/api/admin/upgrade-requests")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.requests).toBeInstanceOf(Array);
    expect(typeof res.body.total).toBe("number");
  });
});

describe("PATCH /api/admin/upgrade-requests/:requestId", () => {
  let email: string;
  let requestId: number;

  beforeEach(async () => {
    const t = await createRegularUser("upgrade-req");
    email = t.email;

    await request(app)
      .post("/api/user/upgrade")
      .set("Cookie", t.cookies)
      .send({ plan: "BASIC" });

    const [row] = await db
      .select({ id: upgradeRequestsTable.id })
      .from(upgradeRequestsTable)
      .where(eq(upgradeRequestsTable.userId, t.user.id))
      .orderBy(desc(upgradeRequestsTable.createdAt))
      .limit(1);
    requestId = row?.id;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("approves an upgrade request", async () => {
    if (!requestId) return;
    const cookies = await getAdminCookies();
    const res = await request(app)
      .patch(`/api/admin/upgrade-requests/${requestId}`)
      .set("Cookie", cookies)
      .send({ status: "APPROVED" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/approved/i);
  });

  it("rejects an upgrade request", async () => {
    if (!requestId) return;
    const cookies = await getAdminCookies();
    const res = await request(app)
      .patch(`/api/admin/upgrade-requests/${requestId}`)
      .set("Cookie", cookies)
      .send({ status: "REJECTED", note: "Not eligible yet" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/rejected/i);
  });
});

describe("GET /api/admin/plan-config", () => {
  it("returns all plan configurations", async () => {
    const cookies = await getAdminCookies();
    const res = await request(app)
      .get("/api/admin/plan-config")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.configs).toBeInstanceOf(Array);
    const plans = res.body.configs.map((c: { plan: string }) => c.plan);
    expect(plans).toContain("FREE");
    expect(plans).toContain("BASIC");
    expect(plans).toContain("PRO");
  });
});
