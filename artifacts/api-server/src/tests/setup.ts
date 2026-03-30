import { beforeAll, afterAll } from "vitest";
import { db, planConfigsTable, usersTable, domainsTable } from "@workspace/db";
import { hashPassword, generateApiKey } from "../lib/auth.js";
import { loadDomainCache } from "../lib/domain-cache.js";

beforeAll(async () => {
  await db
    .insert(planConfigsTable)
    .values([
      {
        plan: "FREE",
        requestLimit: 10,
        mxDetectLimit: 0,
        inboxCheckLimit: 0,
        websiteLimit: 0,
        pageLimit: 0,
        mxDetectionEnabled: false,
        inboxCheckEnabled: false,
      },
      {
        plan: "BASIC",
        requestLimit: 1000,
        mxDetectLimit: 100,
        inboxCheckLimit: 0,
        websiteLimit: 1,
        pageLimit: 10,
        mxDetectionEnabled: true,
        inboxCheckEnabled: false,
      },
      {
        plan: "PRO",
        requestLimit: 10000,
        mxDetectLimit: 0,
        inboxCheckLimit: 0,
        websiteLimit: 10,
        pageLimit: 100,
        mxDetectionEnabled: true,
        inboxCheckEnabled: true,
      },
    ])
    .onConflictDoNothing();

  const adminHash = await hashPassword("admin123");
  const adminApiKey = generateApiKey();
  await db
    .insert(usersTable)
    .values({
      name: "Admin",
      email: "admin@tempshield.io",
      password: adminHash,
      apiKey: adminApiKey,
      role: "ADMIN",
      plan: "PRO",
    })
    .onConflictDoNothing();

  await db
    .insert(domainsTable)
    .values([
      { domain: "mailinator.com", source: "test" },
      { domain: "guerrillamail.com", source: "test" },
      { domain: "tempmail.com", source: "test" },
    ])
    .onConflictDoNothing();

  await loadDomainCache();
});

afterAll(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
