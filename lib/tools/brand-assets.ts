import * as cheerio from "cheerio";
import { fetchHtml } from "./web";

/* ------------------------------------------------------------------ */
/*  Brand asset extraction                                             */
/*  Scrapes a website for visual identity: colors, fonts, images, logo */
/* ------------------------------------------------------------------ */

export type BrandAssets = {
  logo: string | null;
  ogImage: string | null;
  images: string[];
  colors: string[];
  fonts: string[];
  brandName: string;
  tagline: string;
  favicon: string | null;
};

function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith("data:")) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeHexColor(raw: string): string | null {
  const hex = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseColor(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();

  // hex
  const hexResult = normalizeHexColor(trimmed);
  if (hexResult) return hexResult;

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/,
  );
  if (rgbMatch) {
    return rgbToHex(+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]);
  }

  return null;
}

function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
  const brightness = (r + g + b) / 3;
  // skip near-white, near-black, and greys
  return maxDiff < 20 && (brightness > 230 || brightness < 25);
}

export async function extractBrandAssets(
  siteUrl: string,
): Promise<BrandAssets> {
  const html = await fetchHtml(siteUrl);
  const $ = cheerio.load(html);
  const baseUrl = siteUrl;

  // --- Logo ---
  let logo: string | null = null;
  const logoCandidates = [
    $('link[rel="icon"][type="image/svg+xml"]').attr("href"),
    $('link[rel="apple-touch-icon"]').attr("href"),
    $('[class*="logo"] img, [id*="logo"] img, header img').first().attr("src"),
    $('a[href="/"] img, a[href="./"] img').first().attr("src"),
    $('img[alt*="logo" i]').first().attr("src"),
  ];
  for (const candidate of logoCandidates) {
    if (candidate) {
      logo = resolveUrl(candidate, baseUrl);
      if (logo) break;
    }
  }

  // --- Favicon ---
  const faviconHref =
    $('link[rel="icon"]').attr("href") ??
    $('link[rel="shortcut icon"]').attr("href");
  const favicon = faviconHref ? resolveUrl(faviconHref, baseUrl) : null;

  // --- OG Image ---
  const ogImageHref =
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="twitter:image"]').attr("content");
  const ogImage = ogImageHref ? resolveUrl(ogImageHref, baseUrl) : null;

  // --- Key images ---
  const imageSet = new Set<string>();
  if (ogImage) imageSet.add(ogImage);

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const resolved = resolveUrl(src, baseUrl);
    if (!resolved) return;
    // skip tiny tracking pixels and icons
    const width = parseInt($(el).attr("width") ?? "0", 10);
    const height = parseInt($(el).attr("height") ?? "0", 10);
    if ((width > 0 && width < 32) || (height > 0 && height < 32)) return;
    if (/\.(svg|ico)$/i.test(resolved) && !resolved.includes("logo")) return;
    imageSet.add(resolved);
  });

  // Also grab CSS background images from inline styles
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const bgMatch = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (bgMatch) {
      const resolved = resolveUrl(bgMatch[1], baseUrl);
      if (resolved) imageSet.add(resolved);
    }
  });

  const images = [...imageSet].slice(0, 20);

  // --- Colors ---
  const colorCounts = new Map<string, number>();

  // From inline styles
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const colorMatches = style.match(
      /#[0-9a-fA-F]{3,6}\b|rgba?\([^)]+\)/g,
    );
    if (colorMatches) {
      for (const raw of colorMatches) {
        const hex = parseColor(raw);
        if (hex && !isNeutral(hex)) {
          colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
        }
      }
    }
  });

  // From <style> tags
  $("style").each((_, el) => {
    const css = $(el).text();
    const colorMatches = css.match(
      /#[0-9a-fA-F]{3,6}\b|rgba?\([^)]+\)/g,
    );
    if (colorMatches) {
      for (const raw of colorMatches) {
        const hex = parseColor(raw);
        if (hex && !isNeutral(hex)) {
          colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
        }
      }
    }
  });

  // From link[rel=stylesheet] - we won't fetch external CSS to keep it fast
  // but we extract CSS custom properties from inline <style>
  $("style").each((_, el) => {
    const css = $(el).text();
    const varMatches = css.match(/--[^:]+:\s*(#[0-9a-fA-F]{3,6})/g);
    if (varMatches) {
      for (const raw of varMatches) {
        const hexMatch = raw.match(/#[0-9a-fA-F]{3,6}/);
        if (hexMatch) {
          const hex = parseColor(hexMatch[0]);
          if (hex && !isNeutral(hex)) {
            colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 3); // boost CSS vars
          }
        }
      }
    }
  });

  // meta theme-color
  const themeColor = $('meta[name="theme-color"]').attr("content");
  if (themeColor) {
    const hex = parseColor(themeColor);
    if (hex && !isNeutral(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 10);
    }
  }

  const colors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    .slice(0, 8);

  // --- Fonts ---
  const fontSet = new Set<string>();
  $("style").each((_, el) => {
    const css = $(el).text();
    const fontMatches = css.match(/font-family:\s*([^;}{]+)/g);
    if (fontMatches) {
      for (const raw of fontMatches) {
        const value = raw.replace("font-family:", "").trim();
        const primary = value
          .split(",")[0]
          .trim()
          .replace(/["']/g, "");
        if (
          primary &&
          primary.length < 60 &&
          !["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"].includes(
            primary.toLowerCase(),
          )
        ) {
          fontSet.add(primary);
        }
      }
    }
  });

  // Also check inline font-family on body / key elements
  for (const selector of ["body", "h1", "h2", "p", "[class*='hero']"]) {
    $(selector).each((_, el) => {
      const style = $(el).attr("style") ?? "";
      const fontMatch = style.match(/font-family:\s*([^;]+)/);
      if (fontMatch) {
        const primary = fontMatch[1]
          .split(",")[0]
          .trim()
          .replace(/["']/g, "");
        if (
          primary &&
          !["inherit", "initial", "unset"].includes(primary.toLowerCase())
        ) {
          fontSet.add(primary);
        }
      }
    });
  }

  const fonts = [...fontSet].slice(0, 6);

  // --- Brand name & tagline ---
  const brandName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ??
    $("title")
      .first()
      .text()
      .split(/[|\-–—]/)
      .pop()
      ?.trim() ??
    new URL(siteUrl).hostname.replace(/^www\./, "");

  const tagline =
    $('meta[name="description"]').attr("content")?.trim() ??
    $('meta[property="og:description"]').attr("content")?.trim() ??
    $("h1").first().text().trim() ??
    "";

  return {
    logo,
    ogImage,
    images,
    colors,
    fonts,
    brandName,
    tagline,
    favicon,
  };
}
