import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteUrl = searchParams.get("url");

  if (!siteUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const res = await fetch(siteUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FridayBot/1.0; +https://friday.dev)",
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      cleanText(
        readMeta($, "property", "og:title") ??
          readMeta($, "name", "twitter:title") ??
          $("title").first().text(),
      ) ?? new URL(siteUrl).hostname;

    const description =
      cleanText(
        readMeta($, "property", "og:description") ??
          readMeta($, "name", "description") ??
          readMeta($, "name", "twitter:description"),
      ) ?? "";

    const favicon = extractFavicon($, siteUrl);

    return NextResponse.json({
      title: normalizeBrandTitle(title),
      description,
      favicon,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch site metadata" },
      { status: 502 },
    );
  }
}

function cleanText(value?: string | null) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeBrandTitle(title: string) {
  const normalized = title
    .split("|")[0]
    .split(" - ")[0]
    .split(" — ")[0]
    .trim();

  return normalized || title;
}

function readMeta(
  $: cheerio.CheerioAPI,
  attr: "name" | "property",
  key: string,
) {
  return $(`meta[${attr}="${key}"]`).attr("content");
}

function extractFavicon($: cheerio.CheerioAPI, siteUrl: string): string {
  const href =
    $('link[rel="icon"]').attr("href") ??
    $('link[rel="shortcut icon"]').attr("href") ??
    $('link[rel="apple-touch-icon"]').attr("href");

  if (!href) {
    const domain = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  if (href.startsWith("http")) {
    return href;
  }

  const base = new URL(siteUrl);
  if (href.startsWith("//")) {
    return `${base.protocol}${href}`;
  }
  if (href.startsWith("/")) {
    return `${base.origin}${href}`;
  }
  return `${base.origin}/${href}`;
}
