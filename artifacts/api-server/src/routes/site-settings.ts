import { Router } from "express";
import { db, siteSettingsTable, pageSeoTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middlewares/session.js";

const router = Router();

const ALLOWED_SLUGS = new Set(["/", "/pricing", "/docs", "/login", "/signup", "/dashboard", "/upgrade"]);

const DEFAULTS = {
  siteTitle: "TempShield",
  tagline: "Block Fake Emails. Protect Your Platform.",
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  globalMetaTitle: "TempShield — Disposable Email Detection API",
  globalMetaDescription: "Industry-leading disposable email detection API. Real-time verification with 99.9% accuracy.",
  footerText: null as string | null,
};

async function getOrInitSettings() {
  const [row] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(siteSettingsTable).values({ id: 1 }).returning();
  return created;
}

function formatSettings(s: typeof siteSettingsTable.$inferSelect) {
  return {
    siteTitle: s.siteTitle ?? DEFAULTS.siteTitle,
    tagline: s.tagline ?? DEFAULTS.tagline,
    logoUrl: s.logoUrl ?? null,
    faviconUrl: s.faviconUrl ?? null,
    globalMetaTitle: s.globalMetaTitle ?? DEFAULTS.globalMetaTitle,
    globalMetaDescription: s.globalMetaDescription ?? DEFAULTS.globalMetaDescription,
    footerText: s.footerText ?? null,
    updatedAt: s.updatedAt.toISOString(),
  };
}

function formatPageSeo(row: typeof pageSeoTable.$inferSelect | undefined, slug: string) {
  if (!row) {
    return { slug, metaTitle: null, metaDescription: null, keywords: null, ogTitle: null, ogDescription: null, ogImage: null };
  }
  return {
    slug: row.slug,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    keywords: row.keywords,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    ogImage: row.ogImage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Public endpoints ──────────────────────────────────────────────────────────

router.get("/site-settings", async (_req, res) => {
  try {
    const s = await getOrInitSettings();
    res.json(formatSettings(s));
  } catch {
    res.json({ ...DEFAULTS, updatedAt: new Date().toISOString() });
  }
});

router.get("/site-settings/page", async (req: any, res: any) => {
  const slug = String(req.query.slug || "/");
  if (!ALLOWED_SLUGS.has(slug)) {
    res.status(400).json({ error: "Unknown page slug" });
    return;
  }
  try {
    const [row] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.slug, slug)).limit(1);
    res.json(formatPageSeo(row, slug));
  } catch {
    res.json({ slug, metaTitle: null, metaDescription: null, keywords: null, ogTitle: null, ogDescription: null, ogImage: null });
  }
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

router.get("/admin/site-settings", requireAdmin, async (_req, res) => {
  try {
    const s = await getOrInitSettings();
    res.json(formatSettings(s));
  } catch {
    res.json({ ...DEFAULTS, updatedAt: new Date().toISOString() });
  }
});

const updateSiteSettingsSchema = z.object({
  siteTitle: z.string().min(1).max(120).optional(),
  tagline: z.string().max(240).optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  faviconUrl: z.string().url().max(2048).nullable().optional(),
  globalMetaTitle: z.string().max(120).optional(),
  globalMetaDescription: z.string().max(320).optional(),
  footerText: z.string().max(320).nullable().optional(),
});

router.patch("/admin/site-settings", requireAdmin, async (req, res) => {
  const result = updateSiteSettingsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.issues });
    return;
  }

  await getOrInitSettings();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const d = result.data;
  if (d.siteTitle !== undefined) updates.siteTitle = d.siteTitle;
  if (d.tagline !== undefined) updates.tagline = d.tagline;
  if (d.logoUrl !== undefined) updates.logoUrl = d.logoUrl;
  if (d.faviconUrl !== undefined) updates.faviconUrl = d.faviconUrl;
  if (d.globalMetaTitle !== undefined) updates.globalMetaTitle = d.globalMetaTitle;
  if (d.globalMetaDescription !== undefined) updates.globalMetaDescription = d.globalMetaDescription;
  if (d.footerText !== undefined) updates.footerText = d.footerText;

  await db.update(siteSettingsTable).set(updates).where(eq(siteSettingsTable.id, 1));
  res.json({ message: "Site settings updated" });
});

router.get("/admin/site-settings/page", requireAdmin, async (req: any, res: any) => {
  const slug = String(req.query.slug || "/");
  if (!ALLOWED_SLUGS.has(slug)) {
    res.status(400).json({ error: "Unknown page slug" });
    return;
  }
  const [row] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.slug, slug)).limit(1);
  res.json(formatPageSeo(row, slug));
});

const updatePageSeoSchema = z.object({
  metaTitle: z.string().max(120).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  keywords: z.string().max(500).nullable().optional(),
  ogTitle: z.string().max(120).nullable().optional(),
  ogDescription: z.string().max(320).nullable().optional(),
  ogImage: z.string().url().max(2048).nullable().optional(),
});

router.patch("/admin/site-settings/page", requireAdmin, async (req: any, res: any) => {
  const slug = String(req.query.slug || "/");
  if (!ALLOWED_SLUGS.has(slug)) {
    res.status(400).json({ error: "Unknown page slug" });
    return;
  }

  const result = updatePageSeoSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.issues });
    return;
  }

  const d = result.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.metaTitle !== undefined) updates.metaTitle = d.metaTitle;
  if (d.metaDescription !== undefined) updates.metaDescription = d.metaDescription;
  if (d.keywords !== undefined) updates.keywords = d.keywords;
  if (d.ogTitle !== undefined) updates.ogTitle = d.ogTitle;
  if (d.ogDescription !== undefined) updates.ogDescription = d.ogDescription;
  if (d.ogImage !== undefined) updates.ogImage = d.ogImage;

  const [existing] = await db.select({ id: pageSeoTable.id }).from(pageSeoTable).where(eq(pageSeoTable.slug, slug)).limit(1);
  if (!existing) {
    await db.insert(pageSeoTable).values({
      slug,
      metaTitle: (d.metaTitle as string | null) ?? null,
      metaDescription: (d.metaDescription as string | null) ?? null,
      keywords: (d.keywords as string | null) ?? null,
      ogTitle: (d.ogTitle as string | null) ?? null,
      ogDescription: (d.ogDescription as string | null) ?? null,
      ogImage: (d.ogImage as string | null) ?? null,
    });
  } else {
    await db.update(pageSeoTable).set(updates).where(eq(pageSeoTable.slug, slug));
  }

  res.json({ message: "Page SEO updated" });
});

export default router;
