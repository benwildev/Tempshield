import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TEST_USER = {
  name: "Auth Test User",
  email: `auth-test-${Date.now()}@example.com`,
  password: "testpass123",
};

async function cleanupUser(email: string) {
  await db.delete(usersTable).where(eq(usersTable.email, email));
}

describe("POST /api/auth/register", () => {
  const email = `register-${Date.now()}@example.com`;

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("registers a new user successfully", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "New User", email, password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Registration successful");
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.plan).toBe("FREE");
    expect(res.body.user.apiKey).toMatch(/^ts_[a-f0-9]{32}$/);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 400 for duplicate email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "First", email, password: "password123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Second", email, password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email already registered");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "User", email: "not-an-email", password: "password123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for password shorter than 6 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "User", email: `short-pw-${Date.now()}@example.com`, password: "123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: `no-name-${Date.now()}@example.com`, password: "password123" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  const email = `login-test-${Date.now()}@example.com`;

  beforeEach(async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Login Test", email, password: TEST_USER.password });
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Login successful");
    expect(res.body.user.email).toBe(email);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@nowhere.com", password: "somepass" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "something" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("logs out and clears the session cookie", async () => {
    const email = `logout-${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Logout User", email, password: "testpass123" });

    const cookies = registerRes.headers["set-cookie"] as string[];
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");

    await cleanupUser(email);
  });

  it("returns 200 even without a session cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  const email = `me-test-${Date.now()}@example.com`;
  let cookies: string[];

  beforeEach(async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Me User", email, password: "testpass123" });
    cookies = res.headers["set-cookie"] as string[];
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("returns the current user when authenticated", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.plan).toBe("FREE");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
