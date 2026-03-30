import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { db, usersTable, apiUsageTable, userApiKeysTable, webhooksTable, customBlocklistTable, upgradeRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function createUser(suffix: string, plan = "FREE") {
  const email = `user-${suffix}-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "testpass123" });

  if (plan !== "FREE") {
    await db.update(usersTable)
      .set({ plan, requestLimit: plan === "PRO" ? 10000 : 1000 })
      .where(eq(usersTable.email, email));
  }

  return {
    email,
    user: res.body.user,
    cookies: res.headers["set-cookie"] as string[],
  };
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

describe("GET /api/user/dashboard", () => {
  let email: string;
  let cookies: string[];

  beforeEach(async () => {
    const t = await createUser("dashboard");
    email = t.email;
    cookies = t.cookies;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("returns dashboard data for authenticated user", async () => {
    const res = await request(app)
      .get("/api/user/dashboard")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.plan).toBe("FREE");
    expect(res.body.recentUsage).toBeInstanceOf(Array);
    expect(res.body.counts).toBeDefined();
    expect(typeof res.body.counts.namedApiKeys).toBe("number");
    expect(typeof res.body.counts.webhooks).toBe("number");
    expect(typeof res.body.counts.blocklist).toBe("number");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/user/dashboard");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/user/api-key/regenerate", () => {
  let email: string;
  let cookies: string[];
  let originalKey: string;

  beforeEach(async () => {
    const t = await createUser("regen");
    email = t.email;
    cookies = t.cookies;
    originalKey = t.user.apiKey;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("regenerates the primary API key", async () => {
    const res = await request(app)
      .post("/api/user/api-key/regenerate")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.apiKey).toBeDefined();
    expect(res.body.apiKey).toMatch(/^ts_[a-f0-9]{32}$/);
    expect(res.body.apiKey).not.toBe(originalKey);
  });
});

describe("Named API Keys (GET/POST/DELETE /api/user/api-keys)", () => {
  let email: string;
  let cookies: string[];

  beforeEach(async () => {
    const t = await createUser("named-key", "BASIC");
    email = t.email;
    cookies = t.cookies;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("starts with no named keys", async () => {
    const res = await request(app)
      .get("/api/user/api-keys")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.keys).toHaveLength(0);
  });

  it("creates a named API key", async () => {
    const res = await request(app)
      .post("/api/user/api-keys")
      .set("Cookie", cookies)
      .send({ name: "My Integration" });

    expect(res.status).toBe(200);
    expect(res.body.key.name).toBe("My Integration");
    expect(res.body.key.key).toMatch(/^ts_[a-f0-9]{32}$/);
    expect(res.body.key.maskedKey).toMatch(/^ts_[a-f0-9]{3}\*+$/);
  });

  it("lists named API keys with masked keys", async () => {
    await request(app)
      .post("/api/user/api-keys")
      .set("Cookie", cookies)
      .send({ name: "Key One" });

    const res = await request(app)
      .get("/api/user/api-keys")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.keys[0].maskedKey).toBeDefined();
    expect(res.body.keys[0]).not.toHaveProperty("key");
  });

  it("deletes a named API key", async () => {
    const createRes = await request(app)
      .post("/api/user/api-keys")
      .set("Cookie", cookies)
      .send({ name: "To Delete" });

    const keyId = createRes.body.key.id;

    const deleteRes = await request(app)
      .delete(`/api/user/api-keys/${keyId}`)
      .set("Cookie", cookies);

    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/user/api-keys")
      .set("Cookie", cookies);

    expect(listRes.body.total).toBe(0);
  });

  it("returns 404 when deleting another user's key", async () => {
    const other = await createUser("other-key-user", "BASIC");
    const otherCreate = await request(app)
      .post("/api/user/api-keys")
      .set("Cookie", other.cookies)
      .send({ name: "Other Key" });
    const otherId = otherCreate.body.key.id;

    const res = await request(app)
      .delete(`/api/user/api-keys/${otherId}`)
      .set("Cookie", cookies);

    expect(res.status).toBe(404);

    await cleanupUser(other.email);
  });
});

describe("Webhooks (GET/POST/PATCH/DELETE /api/user/webhooks)", () => {
  let email: string;
  let cookies: string[];

  beforeEach(async () => {
    const t = await createUser("webhook", "PRO");
    email = t.email;
    cookies = t.cookies;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("lists webhooks (empty for new PRO user)", async () => {
    const res = await request(app)
      .get("/api/user/webhooks")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.canCreate).toBe(true);
    expect(res.body.webhooks).toHaveLength(0);
  });

  it("returns canCreate: false for non-PRO users", async () => {
    const freeUser = await createUser("free-webhook");
    const res = await request(app)
      .get("/api/user/webhooks")
      .set("Cookie", freeUser.cookies);

    expect(res.body.canCreate).toBe(false);
    await cleanupUser(freeUser.email);
  });

  it("creates a webhook", async () => {
    const res = await request(app)
      .post("/api/user/webhooks")
      .set("Cookie", cookies)
      .send({ url: "https://example.com/webhook", secret: "mysecret" });

    expect(res.status).toBe(200);
    expect(res.body.webhook.url).toBe("https://example.com/webhook");
    expect(res.body.webhook.enabled).toBe(true);
    expect(res.body.webhook.secret).toMatch(/^myse\*+/);
  });

  it("returns 403 when non-PRO user tries to create webhook", async () => {
    const freeUser = await createUser("free-webhook-create");
    const res = await request(app)
      .post("/api/user/webhooks")
      .set("Cookie", freeUser.cookies)
      .send({ url: "https://example.com/hook" });

    expect(res.status).toBe(403);
    await cleanupUser(freeUser.email);
  });

  it("updates a webhook", async () => {
    const createRes = await request(app)
      .post("/api/user/webhooks")
      .set("Cookie", cookies)
      .send({ url: "https://example.com/webhook" });

    const id = createRes.body.webhook.id;

    const res = await request(app)
      .patch(`/api/user/webhooks/${id}`)
      .set("Cookie", cookies)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.webhook.enabled).toBe(false);
  });

  it("deletes a webhook", async () => {
    const createRes = await request(app)
      .post("/api/user/webhooks")
      .set("Cookie", cookies)
      .send({ url: "https://example.com/webhook" });

    const id = createRes.body.webhook.id;

    const deleteRes = await request(app)
      .delete(`/api/user/webhooks/${id}`)
      .set("Cookie", cookies);

    expect(deleteRes.status).toBe(200);
  });
});

describe("Custom Blocklist (GET/POST/DELETE /api/user/blocklist)", () => {
  let email: string;
  let cookies: string[];

  beforeEach(async () => {
    const t = await createUser("blocklist");
    email = t.email;
    cookies = t.cookies;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("starts with an empty blocklist", async () => {
    const res = await request(app)
      .get("/api/user/blocklist")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.entries).toHaveLength(0);
  });

  it("adds a domain to the blocklist", async () => {
    const res = await request(app)
      .post("/api/user/blocklist")
      .set("Cookie", cookies)
      .send({ domain: "spammy-domain.com" });

    expect(res.status).toBe(200);
    expect(res.body.entry.domain).toBe("spammy-domain.com");
  });

  it("normalises domain to lowercase", async () => {
    const res = await request(app)
      .post("/api/user/blocklist")
      .set("Cookie", cookies)
      .send({ domain: "UPPERCASE-DOMAIN.COM" });

    expect(res.status).toBe(200);
    expect(res.body.entry.domain).toBe("uppercase-domain.com");
  });

  it("returns 409 for duplicate domain", async () => {
    await request(app)
      .post("/api/user/blocklist")
      .set("Cookie", cookies)
      .send({ domain: "dup-domain.com" });

    const res = await request(app)
      .post("/api/user/blocklist")
      .set("Cookie", cookies)
      .send({ domain: "dup-domain.com" });

    expect(res.status).toBe(409);
  });

  it("returns 400 for an invalid domain format", async () => {
    const res = await request(app)
      .post("/api/user/blocklist")
      .set("Cookie", cookies)
      .send({ domain: "not_a_domain" });

    expect(res.status).toBe(400);
  });

  it("removes a domain from the blocklist", async () => {
    const addRes = await request(app)
      .post("/api/user/blocklist")
      .set("Cookie", cookies)
      .send({ domain: "to-remove.com" });

    const id = addRes.body.entry.id;

    const deleteRes = await request(app)
      .delete(`/api/user/blocklist/${id}`)
      .set("Cookie", cookies);

    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/user/blocklist")
      .set("Cookie", cookies);

    expect(listRes.body.total).toBe(0);
  });
});

describe("GET /api/user/usage", () => {
  let email: string;
  let cookies: string[];
  let apiKey: string;

  beforeEach(async () => {
    const t = await createUser("usage");
    email = t.email;
    cookies = t.cookies;
    apiKey = t.user.apiKey;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("returns an audit log of email checks", async () => {
    await request(app)
      .post("/api/check-email")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ email: "test@gmail.com" });

    const res = await request(app)
      .get("/api/user/usage")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.entries).toBeInstanceOf(Array);
    expect(res.body.entries.length).toBeGreaterThan(0);
    const entry = res.body.entries[0];
    expect(entry).toHaveProperty("endpoint");
    expect(entry).toHaveProperty("timestamp");
  });
});
