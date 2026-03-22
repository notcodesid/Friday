import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { BrandAssets } from "./brand-assets";
import type { FetchedImage } from "./web";

/* ------------------------------------------------------------------ */
/*  Gemini image generation                                            */
/*  Uses Gemini's image generation to create branded ad images         */
/* ------------------------------------------------------------------ */

export type AdFormat =
  | "instagram-post"
  | "instagram-story"
  | "facebook-ad"
  | "linkedin-banner"
  | "x-post";

export type AdFormatSpec = {
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
};

export const AD_FORMATS: Record<AdFormat, AdFormatSpec> = {
  "instagram-post": {
    label: "Instagram Post",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
  },
  "instagram-story": {
    label: "Instagram Story",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
  },
  "facebook-ad": {
    label: "Facebook Ad",
    width: 1200,
    height: 628,
    aspectRatio: "1.91:1",
  },
  "linkedin-banner": {
    label: "LinkedIn Banner",
    width: 1200,
    height: 627,
    aspectRatio: "1.91:1",
  },
  "x-post": {
    label: "X Post",
    width: 1200,
    height: 675,
    aspectRatio: "16:9",
  },
};

function buildAdPrompt(
  assets: BrandAssets,
  format: AdFormat,
  hasReferenceImages: boolean,
  customPrompt?: string,
): string {
  const spec = AD_FORMATS[format];
  const colorPalette =
    assets.colors.length > 0
      ? `Brand colors: ${assets.colors.join(", ")}`
      : "Use a clean, professional color palette";
  const fontInfo =
    assets.fonts.length > 0
      ? `Brand fonts: ${assets.fonts.join(", ")}`
      : "Use clean, modern typography";

  const basePrompt = [
    `Create a professional, high-quality ${spec.label} advertisement image for "${assets.brandName}".`,
    `Aspect ratio: ${spec.aspectRatio} (${spec.width}x${spec.height} pixels).`,
    hasReferenceImages
      ? "I've attached reference images from the brand's actual website. Use these to match the brand's visual style, imagery, layout patterns, and overall aesthetic. The ad should feel like a natural extension of this website's design."
      : "",
    colorPalette + ".",
    fontInfo + ".",
    assets.tagline
      ? `Brand tagline: "${assets.tagline}".`
      : "",
    "The design should be modern, clean, and suitable for social media advertising.",
    "Include the brand name prominently in the design.",
    "Make it visually striking and professional — this should look like a real brand advertisement, not a mockup.",
    "Do NOT include placeholder text like 'lorem ipsum'. Use actual brand messaging.",
    customPrompt
      ? `Additional direction: ${customPrompt}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return basePrompt;
}

export type GeneratedAd = {
  format: AdFormat;
  imageBase64: string;
  mimeType: string;
  prompt: string;
};

export async function generateBrandAd(
  assets: BrandAssets,
  format: AdFormat,
  customPrompt?: string,
  referenceImages?: FetchedImage[],
): Promise<GeneratedAd> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      // @ts-expect-error -- Gemini image generation uses responseModalities which is supported at runtime
      responseModalities: ["image", "text"],
    },
  });

  const images = referenceImages ?? [];
  const prompt = buildAdPrompt(assets, format, images.length > 0, customPrompt);

  // Build multimodal parts: reference images first, then the text prompt
  const parts: Part[] = [];
  for (const img of images) {
    parts.push({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType,
      },
    });
  }
  parts.push({ text: prompt });

  const result = await model.generateContent(parts);
  const response = result.response;
  const candidates = response.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error("No response from Gemini");
  }

  const responseParts = candidates[0].content.parts;

  for (const part of responseParts) {
    if (part.inlineData) {
      return {
        format,
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/png",
        prompt,
      };
    }
  }

  throw new Error(
    "Gemini did not return an image. The model may not support image generation with the current configuration.",
  );
}

export async function generateMultipleAds(
  assets: BrandAssets,
  formats: AdFormat[],
  customPrompt?: string,
  referenceImages?: FetchedImage[],
): Promise<GeneratedAd[]> {
  const results = await Promise.allSettled(
    formats.map((format) => generateBrandAd(assets, format, customPrompt, referenceImages)),
  );

  const ads: GeneratedAd[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      ads.push(result.value);
    }
  }

  return ads;
}
