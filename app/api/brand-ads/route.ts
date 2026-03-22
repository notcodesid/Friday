import { NextResponse } from "next/server";

import { extractBrandAssets } from "@/lib/tools/brand-assets";
import { generateBrandAd, type AdFormat, AD_FORMATS } from "@/lib/tools/gemini";
import { requireSession } from "@/lib/auth/session";
import { hasGemini } from "@/lib/env";
import { fetchImageAsBase64, type FetchedImage } from "@/lib/tools/web";

export const runtime = "nodejs";
export const maxDuration = 120;

type BrandAdRequest = {
  siteUrl: string;
  format: AdFormat;
  prompt?: string;
};

const VALID_FORMATS = new Set(Object.keys(AD_FORMATS));

export async function POST(request: Request) {
  if (!hasGemini()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: BrandAdRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.siteUrl || typeof body.siteUrl !== "string") {
    return NextResponse.json(
      { error: "Missing 'siteUrl' field." },
      { status: 400 },
    );
  }

  if (!body.format || !VALID_FORMATS.has(body.format)) {
    return NextResponse.json(
      {
        error: `Invalid 'format'. Must be one of: ${[...VALID_FORMATS].join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const assets = await extractBrandAssets(body.siteUrl);

    // Fetch reference images from the website (OG image + top page images)
    // so Gemini can match the brand's actual visual style
    const imageUrls: string[] = [];
    if (assets.ogImage) imageUrls.push(assets.ogImage);
    if (assets.logo) imageUrls.push(assets.logo);
    for (const img of assets.images) {
      if (imageUrls.length >= 5) break;
      if (!imageUrls.includes(img)) imageUrls.push(img);
    }

    const fetchedImages = await Promise.all(
      imageUrls.map((url) => fetchImageAsBase64(url)),
    );
    const referenceImages: FetchedImage[] = fetchedImages.filter(
      (img): img is FetchedImage => img !== null,
    );

    const ad = await generateBrandAd(
      assets,
      body.format,
      body.prompt,
      referenceImages,
    );

    return NextResponse.json({
      format: ad.format,
      mimeType: ad.mimeType,
      imageBase64: ad.imageBase64,
      brandAssets: {
        brandName: assets.brandName,
        colors: assets.colors,
        fonts: assets.fonts,
        logo: assets.logo,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ad generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
