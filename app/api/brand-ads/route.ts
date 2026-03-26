import { NextResponse } from "next/server";

import { generateBrandAd } from "@/lib/tools/gemini";
import { extractBrandAssets, type BrandAssets } from "@/lib/tools/brand-assets";
import { requireSession } from "@/lib/auth/session";
import { hasGemini } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

type BrandAdsRequest = {
  siteUrl: string;
  format: string;
  prompt?: string;
};

type GeneratedAdImage = {
  format: string;
  mimeType: string;
  imageBase64: string;
  brandAssets?: {
    brandName: string;
    colors: string[];
    fonts: string[];
    logo: string | null;
  };
};

export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!hasGemini()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let body: BrandAdsRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { siteUrl, format, prompt } = body;
  if (!siteUrl || !format) {
    return NextResponse.json(
      { error: "Missing siteUrl or format." },
      { status: 400 },
    );
  }

  try {
    const brandAssets = await extractBrandAssets(siteUrl);

    const assets: BrandAssets = {
      logo: brandAssets.logo,
      ogImage: brandAssets.ogImage,
      images: brandAssets.images,
      colors: brandAssets.colors,
      fonts: brandAssets.fonts,
      brandName: brandAssets.brandName,
      tagline: brandAssets.tagline,
      favicon: brandAssets.favicon,
    };

    const ad = await generateBrandAd(assets, format as any, prompt);

    const response: GeneratedAdImage = {
      format: ad.format,
      mimeType: ad.mimeType,
      imageBase64: ad.imageBase64,
      brandAssets: {
        brandName: brandAssets.brandName,
        colors: brandAssets.colors,
        fonts: brandAssets.fonts,
        logo: brandAssets.logo,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate ad";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
