import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "wouter";

export interface SiteSettings {
  siteTitle: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  globalMetaTitle: string;
  globalMetaDescription: string;
  footerText: string | null;
  updatedAt?: string;
}

export interface PageSeo {
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
}

const ALLOWED_SLUGS = new Set(["/", "/pricing", "/docs", "/login", "/signup", "/dashboard", "/upgrade"]);

const DEFAULTS: SiteSettings = {
  siteTitle: "TempShield",
  tagline: "Block Fake Emails. Protect Your Platform.",
  logoUrl: null,
  faviconUrl: null,
  globalMetaTitle: "TempShield — Disposable Email Detection API",
  globalMetaDescription: "Industry-leading disposable email detection API. Real-time verification with 99.9% accuracy.",
  footerText: null,
};

export function useSiteSettings(): SiteSettings {
  const { data } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings"],
    queryFn: () => fetch("/api/site-settings").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULTS;
}

export function usePageSeo(slug: string): PageSeo | null {
  const enabled = ALLOWED_SLUGS.has(slug);
  const { data } = useQuery<PageSeo>({
    queryKey: [`/api/site-settings/page?slug=${slug}`],
    queryFn: () => fetch(`/api/site-settings/page?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? null;
}

export function useApplyHeadMeta() {
  const settings = useSiteSettings();
  const [location] = useLocation();

  const pageSeo = usePageSeo(location);

  useEffect(() => {
    const title = pageSeo?.metaTitle || settings.globalMetaTitle;
    const description = pageSeo?.metaDescription || settings.globalMetaDescription;
    const keywords = pageSeo?.keywords || null;
    const ogTitle = pageSeo?.ogTitle || title;
    const ogDescription = pageSeo?.ogDescription || description;
    const ogImage = pageSeo?.ogImage || null;

    document.title = title;

    setMeta("name", "description", description);
    if (keywords) {
      setMeta("name", "keywords", keywords);
    }

    setMeta("property", "og:title", ogTitle);
    setMeta("property", "og:description", ogDescription);
    if (ogImage) {
      setMeta("property", "og:image", ogImage);
    }

    if (settings.faviconUrl) {
      setFavicon(settings.faviconUrl);
    }
  }, [settings, pageSeo, location]);
}

function setMeta(attr: "name" | "property", value: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${value}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setFavicon(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "icon";
    document.head.appendChild(el);
  }
  el.href = href;
}
