import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  bulkJobsTable,
  usersTable,
  type BulkJobResultItem,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { getPlanConfig } from "../lib/auth.js";
import { performChecks, maybeResetMonthlyUsage } from "./check-email.js";

const router = Router();

// ─── In-Memory Job Queue ───────────────────────────────────────────────────

const jobQueue: number[] = [];
let isWorkerRunning = false;

async function processJob(jobId: number): Promise<void> {
  const [job] = await db
    .select()
    .from(bulkJobsTable)
    .where(eq(bulkJobsTable.id, jobId))
    .limit(1);

  if (!job) return;

  await db
    .update(bulkJobsTable)
    .set({ status: "processing" })
    .where(eq(bulkJobsTable.id, jobId));

  const [userSettings] = await db
    .select({ plan: usersTable.plan, blockFreeEmails: usersTable.blockFreeEmails })
    .from(usersTable)
    .where(eq(usersTable.id, job.userId))
    .limit(1);

  const planConfig = await getPlanConfig(userSettings?.plan ?? "FREE");
  const blockFreeEmails = userSettings?.blockFreeEmails ?? false;

  const emails = (job.emails as string[]) ?? [];
  const results: BulkJobResultItem[] = [];
  let disposableCount = 0;
  let safeCount = 0;

  const BATCH_SIZE = 10;

  try {
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (email) => {
          try {
            const r = await performChecks(email, job.userId, planConfig);
            const isDisposable = r.disposable || (blockFreeEmails && r.isFreeEmail);
            return {
              email,
              domain: r.domain,
              isDisposable,
              reputationScore: r.reputationScore,
              riskLevel: r.riskLevel,
              tags: r.tags,
              isValidSyntax: r.isValidSyntax,
              isFreeEmail: r.isFreeEmail,
              isRoleAccount: r.roleAccount,
              mxValid: r.mxValidResult ?? null,
              inboxSupport: r.inboxSupportResult ?? null,
            } satisfies BulkJobResultItem;
          } catch {
            return {
              email,
              domain: email.split("@")[1] ?? "",
              isDisposable: false,
              reputationScore: 0,
              riskLevel: "unknown",
              tags: [],
              isValidSyntax: false,
              isFreeEmail: false,
              isRoleAccount: false,
              mxValid: null,
              inboxSupport: null,
              error: "Check failed",
            } satisfies BulkJobResultItem;
          }
        })
      );

      for (const r of batchResults) {
        results.push(r);
        if (r.isDisposable) disposableCount++;
        else if (!r.error) safeCount++;
      }

      await db
        .update(bulkJobsTable)
        .set({
          processedCount: results.length,
          disposableCount,
          safeCount,
          results: results satisfies BulkJobResultItem[],
        })
        .where(eq(bulkJobsTable.id, jobId));
    }

    await db
      .update(bulkJobsTable)
      .set({
        status: "done",
        completedAt: new Date(),
        processedCount: results.length,
        disposableCount,
        safeCount,
        results: results satisfies BulkJobResultItem[],
      })
      .where(eq(bulkJobsTable.id, jobId));
  } catch (err) {
    await db
      .update(bulkJobsTable)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
        results: results satisfies BulkJobResultItem[],
        processedCount: results.length,
        disposableCount,
        safeCount,
      })
      .where(eq(bulkJobsTable.id, jobId));
  }
}

async function runWorker(): Promise<void> {
  while (jobQueue.length > 0) {
    const jobId = jobQueue.shift()!;
    try {
      await processJob(jobId);
    } catch {
      // swallow — job already marked failed inside processJob
    }
  }
  isWorkerRunning = false;
}

export function enqueueJob(jobId: number): void {
  jobQueue.push(jobId);
  if (!isWorkerRunning) {
    isWorkerRunning = true;
    void runWorker();
  }
}

export function startBulkWorker(): void {
  // On server start, re-queue any jobs stuck in "pending" or "processing"
  db.select({ id: bulkJobsTable.id })
    .from(bulkJobsTable)
    .where(inArray(bulkJobsTable.status, ["pending", "processing"]))
    .then((rows) => {
      for (const r of rows) enqueueJob(r.id);
    })
    .catch(() => {});
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const createBulkJobSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(1000),
});

function requireSession(req: Request, res: Response): number | null {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.userId;
}

// POST /api/bulk-jobs — create a new bulk job
router.post("/bulk-jobs", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;

  const [user] = await db
    .select({
      plan: usersTable.plan,
      requestCount: usersTable.requestCount,
      requestLimit: usersTable.requestLimit,
      usagePeriodStart: usersTable.usagePeriodStart,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const planConfig = await getPlanConfig(user.plan);
  const maxBulkEmails = planConfig.maxBulkEmails ?? 0;

  if (maxBulkEmails === 0) {
    res.status(403).json({
      error: "Bulk verification requires a BASIC or PRO plan.",
      planRequired: "BASIC",
    });
    return;
  }

  const parsed = createBulkJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide an 'emails' array with valid email addresses." });
    return;
  }

  const { emails } = parsed.data;

  if (emails.length > maxBulkEmails) {
    res.status(400).json({
      error: `Your plan allows up to ${maxBulkEmails} emails per bulk job. You submitted ${emails.length}.`,
      maxBulkEmails,
    });
    return;
  }

  // Reset monthly usage if we've rolled into a new billing period
  const currentRequestCount = await maybeResetMonthlyUsage(
    userId,
    user.usagePeriodStart,
    user.requestCount
  );

  const remaining = (planConfig.requestLimit ?? 0) - currentRequestCount;
  if (remaining <= 0) {
    res.status(429).json({ error: "Monthly request limit reached. Upgrade your plan for more." });
    return;
  }

  if (emails.length > remaining) {
    res.status(429).json({
      error: `Only ${remaining} request(s) remaining this month but ${emails.length} emails submitted.`,
      requestsRemaining: remaining,
    });
    return;
  }

  // Deduct quota upfront
  await db
    .update(usersTable)
    .set({ requestCount: currentRequestCount + emails.length })
    .where(eq(usersTable.id, userId));

  const [job] = await db
    .insert(bulkJobsTable)
    .values({
      userId,
      status: "pending",
      emails: emails satisfies string[],
      totalEmails: emails.length,
      processedCount: 0,
      disposableCount: 0,
      safeCount: 0,
      results: [] satisfies BulkJobResultItem[],
    })
    .returning({ id: bulkJobsTable.id });

  if (!job) {
    res.status(500).json({ error: "Failed to create job" });
    return;
  }

  enqueueJob(job.id);

  res.status(201).json({ jobId: job.id, totalEmails: emails.length });
});

// GET /api/bulk-jobs — list user's jobs (newest first, no results payload)
router.get("/bulk-jobs", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;

  const jobs = await db
    .select({
      id: bulkJobsTable.id,
      status: bulkJobsTable.status,
      totalEmails: bulkJobsTable.totalEmails,
      processedCount: bulkJobsTable.processedCount,
      disposableCount: bulkJobsTable.disposableCount,
      safeCount: bulkJobsTable.safeCount,
      errorMessage: bulkJobsTable.errorMessage,
      createdAt: bulkJobsTable.createdAt,
      completedAt: bulkJobsTable.completedAt,
    })
    .from(bulkJobsTable)
    .where(eq(bulkJobsTable.userId, userId))
    .orderBy(desc(bulkJobsTable.createdAt))
    .limit(50);

  res.json(jobs);
});

// GET /api/bulk-jobs/:id — get job status + full results (owner only)
router.get("/bulk-jobs/:id", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;

  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const [job] = await db
    .select()
    .from(bulkJobsTable)
    .where(eq(bulkJobsTable.id, jobId))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.userId !== userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(job);
});

// GET /api/bulk-jobs/:id/download — download results as CSV
router.get("/bulk-jobs/:id/download", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;

  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const [job] = await db
    .select()
    .from(bulkJobsTable)
    .where(eq(bulkJobsTable.id, jobId))
    .limit(1);

  if (!job || job.userId !== userId) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const results = (job.results as BulkJobResultItem[]) ?? [];

  const header = "email,domain,is_disposable,reputation_score,risk_level,is_free_email,is_role_account,mx_valid,inbox_support,tags\n";
  const rows = results.map((r) => [
    `"${r.email}"`,
    `"${r.domain}"`,
    r.isDisposable ? "true" : "false",
    r.reputationScore,
    `"${r.riskLevel}"`,
    r.isFreeEmail ? "true" : "false",
    r.isRoleAccount ? "true" : "false",
    r.mxValid === null ? "" : r.mxValid ? "true" : "false",
    r.inboxSupport === null ? "" : r.inboxSupport ? "true" : "false",
    `"${(r.tags ?? []).join(";")}"`,
  ].join(",")).join("\n");

  const csv = header + rows;
  const filename = `bulk-verify-job-${jobId}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;
