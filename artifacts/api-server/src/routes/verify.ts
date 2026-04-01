import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db, paymentSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isDisposableDomain } from "../lib/domain-cache.js";
import {
  computeReputationScore,
  computeRiskLevel,
  buildTags,
  isRoleAccount,
  isFreeEmail,
} from "../lib/reputation.js";

const router = Router();

const FREE_VERIFY_COOKIE = "tempshield_free_verify";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface FreeSession {
  count: number;
  expiresAt: Date;
}

const freeSessions = new Map<string, FreeSession>();

function pruneExpired() {
  const now = new Date();
  for (const [k, v] of freeSessions) {
    if (v.expiresAt < now) freeSessions.delete(k);
  }
}

async function getFreeVerifyLimit(): Promise<number> {
  try {
    const [row] = await db
      .select({ freeVerifyLimit: paymentSettingsTable.freeVerifyLimit })
      .from(paymentSettingsTable)
      .where(eq(paymentSettingsTable.id, 1))
      .limit(1);
    return row?.freeVerifyLimit ?? 5;
  } catch {
    return 5;
  }
}

function getOrCreateSession(sessionId: string | undefined): { sessionId: string; session: FreeSession; isNew: boolean } {
  pruneExpired();
  if (sessionId) {
    const existing = freeSessions.get(sessionId);
    if (existing && existing.expiresAt > new Date()) {
      return { sessionId, session: existing, isNew: false };
    }
  }
  const newId = uuidv4();
  const session: FreeSession = { count: 0, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
  freeSessions.set(newId, session);
  return { sessionId: newId, session, isNew: true };
}

const freeVerifySchema = z.object({
  email: z.string().email(),
});

// GET /api/verify/free/status — returns remaining checks for current session
router.get("/verify/free/status", async (req, res) => {
  const cookieId = req.cookies?.[FREE_VERIFY_COOKIE];
  const limit = await getFreeVerifyLimit();
  const { sessionId, session, isNew } = getOrCreateSession(cookieId);

  if (isNew) {
    res.cookie(FREE_VERIFY_COOKIE, sessionId, {
      httpOnly: true,
      maxAge: SESSION_TTL_MS,
      sameSite: "lax",
      path: "/",
    });
  }

  const used = session.count;
  const remaining = Math.max(0, limit - used);
  res.json({ used, limit, remaining, limitReached: remaining === 0 });
});

// POST /api/verify/free — public email check, session-rate-limited
router.post("/verify/free", async (req, res) => {
  const cookieId = req.cookies?.[FREE_VERIFY_COOKIE];
  const limit = await getFreeVerifyLimit();
  const { sessionId, session, isNew } = getOrCreateSession(cookieId);

  if (isNew || !cookieId) {
    res.cookie(FREE_VERIFY_COOKIE, sessionId, {
      httpOnly: true,
      maxAge: SESSION_TTL_MS,
      sameSite: "lax",
      path: "/",
    });
  }

  const remaining = Math.max(0, limit - session.count);
  if (remaining === 0) {
    res.status(429).json({
      error: "You have used all your free checks. Sign up for a free account to get more.",
      used: session.count,
      limit,
      remaining: 0,
      limitReached: true,
    });
    return;
  }

  const parsed = freeVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const { email } = parsed.data;
  const [localPart, domainRaw] = email.split("@");
  const domain = domainRaw?.toLowerCase() ?? "";

  const disposable = isDisposableDomain(domain);
  const roleAccount = isRoleAccount(localPart ?? "");
  const isFree = isFreeEmail(domain);

  const reputationScore = computeReputationScore({
    isDisposable: disposable,
    hasMx: undefined,
    hasInbox: undefined,
    isAdmin: roleAccount,
    isFree,
    domain,
  });
  const riskLevel = computeRiskLevel(reputationScore);
  const tags = buildTags({
    isDisposable: disposable,
    roleAccount,
    freeProvider: isFree,
  });

  session.count += 1;

  const newRemaining = Math.max(0, limit - session.count);

  res.json({
    email,
    domain,
    isDisposable: disposable,
    reputationScore,
    riskLevel,
    tags,
    isValidSyntax: true,
    isFreeEmail: isFree,
    isRoleAccount: roleAccount,
    mxValid: null,
    inboxSupport: null,
    canConnectSmtp: null,
    mxAcceptsMail: null,
    mxRecords: [],
    isDeliverable: null,
    isCatchAll: null,
    isDisabled: null,
    hasInboxFull: null,
    used: session.count,
    limit,
    remaining: newRemaining,
    limitReached: newRemaining === 0,
  });
});

export default router;
