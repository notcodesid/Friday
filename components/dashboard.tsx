"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { OnboardingWizard, type WizardStep } from "./onboarding-wizard";
import { Workspace } from "./workspace";
import { useAuth } from "@/lib/auth/auth-context";
import {
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle,
  Chrome,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image,
  Loader2,
  LogOut,
  Mail,
  Target,
  Workflow,
  X,
} from "lucide-react";

type ViewType =
  | "home"
  | "company-report"
  | "marketing-console"
  | "product-information"
  | "competitor-analysis"
  | "brand-voice"
  | "strategic-insights";

import type {
  BrandVoiceDoc,
  CompetitorRecord,
  ProductAnalysis,
  CompetitorAnalysis,
  CompetitiveInsights,
} from "@/lib/agents/schemas";
import type { FridayContext } from "@/lib/agents/core/context";
import type { Session } from "@supabase/supabase-js";

type BrandMeta = {
  title: string;
  description: string;
  favicon: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type PosterAsset = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  proofPoints: string[];
  cta: string;
  footer: string;
};

type AdFormat =
  | "instagram-post"
  | "instagram-story"
  | "facebook-ad"
  | "linkedin-banner"
  | "x-post";

const AD_FORMAT_OPTIONS: Array<{ value: AdFormat; label: string }> = [
  { value: "instagram-post", label: "Instagram Post" },
  { value: "instagram-story", label: "Instagram Story" },
  { value: "facebook-ad", label: "Facebook Ad" },
  { value: "linkedin-banner", label: "LinkedIn Banner" },
  { value: "x-post", label: "X Post" },
];

type GeneratedAdImage = {
  format: AdFormat;
  mimeType: string;
  imageBase64: string;
  brandAssets?: {
    brandName: string;
    colors: string[];
    fonts: string[];
    logo: string | null;
  };
};

type StoredWorkspaceState = {
  version: 1;
  siteUrl: string | null;
  competitors: CompetitorRecord[];
  brandVoiceDoc: BrandVoiceDoc | null;
  analysis: AnalysisState;
};

const WORKSPACE_STATE_STORAGE_KEY = "friday-workspace-state-v1";

function readStoredWorkspaceState(): StoredWorkspaceState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredWorkspaceState;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredWorkspaceState(value: StoredWorkspaceState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(value));
}

function clearStoredWorkspaceState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(WORKSPACE_STATE_STORAGE_KEY);
}

function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : /^[\w.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(trimmed)
      ? `https://${trimmed}`
      : null;

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractSiteUrl(value: string) {
  const direct = normalizeSiteUrl(value);
  if (direct) {
    return direct;
  }

  const match = value.match(/https?:\/\/[^\s]+/i);
  if (!match) {
    return null;
  }

  return normalizeSiteUrl(match[0].replace(/[),.;!?]+$/, ""));
}

function getSiteDomain(siteUrl: string) {
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl;
  }
}

function getFallbackBrandMeta(siteUrl: string): BrandMeta {
  const domain = getSiteDomain(siteUrl).replace(/^www\./, "");

  return {
    title: domain,
    description: "",
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  };
}

const MANUAL_COMPETITOR_REASON = "Added manually.";

function normalizeCompetitorDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/?#].*$/, "")
      .replace(/\/+$/, "");
  }
}

function getCompetitorLogo(domain: string, explicitLogo?: string) {
  const trimmed = explicitLogo?.trim();
  if (trimmed) {
    return trimmed;
  }

  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function normalizeCompetitorRecord(value: unknown): CompetitorRecord | null {
  if (typeof value === "string") {
    const domain = normalizeCompetitorDomain(value);
    if (!domain) {
      return null;
    }

    return {
      name: domain,
      domain,
      logo: getCompetitorLogo(domain),
      reason: MANUAL_COMPETITOR_REASON,
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const competitor = value as Partial<CompetitorRecord>;
  const domain =
    typeof competitor.domain === "string"
      ? normalizeCompetitorDomain(competitor.domain)
      : "";

  if (!domain) {
    return null;
  }

  const reason =
    typeof competitor.reason === "string" && competitor.reason.trim()
      ? competitor.reason.trim()
      : MANUAL_COMPETITOR_REASON;
  const positioning =
    typeof competitor.positioning === "string" && competitor.positioning.trim()
      ? competitor.positioning.trim()
      : undefined;

  return {
    name:
      typeof competitor.name === "string" && competitor.name.trim()
        ? competitor.name.trim()
        : domain,
    domain,
    logo: getCompetitorLogo(
      domain,
      typeof competitor.logo === "string" ? competitor.logo : undefined,
    ),
    reason,
    positioning,
  };
}

function normalizeCompetitorRecords(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((item) => normalizeCompetitorRecord(item))
    .filter((competitor): competitor is CompetitorRecord => {
      if (!competitor || seen.has(competitor.domain)) {
        return false;
      }

      seen.add(competitor.domain);
      return true;
    });
}

function useBrandMeta(siteUrl: string | null) {
  const fallbackBrand = siteUrl
    ? getFallbackBrandMeta(siteUrl)
    : {
        title: "Website",
        description: "",
        favicon: "https://www.google.com/s2/favicons?sz=64",
      };
  const [loadedBrand, setLoadedBrand] = useState<(BrandMeta & { siteUrl: string }) | null>(
    null,
  );

  const brand =
    siteUrl && loadedBrand?.siteUrl === siteUrl ? loadedBrand : fallbackBrand;

  useEffect(() => {
    if (!siteUrl) {
      return;
    }

    let cancelled = false;
    fetch(`/api/brand-meta?url=${encodeURIComponent(siteUrl)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.title) {
          setLoadedBrand({
            siteUrl,
            title: data.title,
            description: data.description ?? "",
            favicon: data.favicon ?? fallbackBrand.favicon,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fallbackBrand.favicon, siteUrl]);

  return brand;
}

/* ------------------------------------------------------------------ */
/*  Analysis pipeline hook                                              */
/* ------------------------------------------------------------------ */

type AnalysisState = {
  isRunning: boolean;
  currentStep: number;
  stepLabel: string;
  productAnalysis: ProductAnalysis | null;
  competitors: CompetitorRecord[] | null;
  competitorAnalyses: CompetitorAnalysis[];
  insights: CompetitiveInsights | null;
  errors: Array<{ step: number | string; message: string }>;
};

const initialAnalysisState: AnalysisState = {
  isRunning: false,
  currentStep: 0,
  stepLabel: "",
  productAnalysis: null,
  competitors: null,
  competitorAnalyses: [],
  insights: null,
  errors: [],
};

function buildMarketingContext({
  brand,
  brandVoiceDoc,
  competitors,
  productAnalysis,
  insights,
  siteUrl,
}: {
  brand: BrandMeta;
  brandVoiceDoc: BrandVoiceDoc | null;
  competitors: CompetitorRecord[];
  productAnalysis: ProductAnalysis | null;
  insights: CompetitiveInsights | null;
  siteUrl: string | null;
}): FridayContext {
  const voiceSignals = [
    ...(productAnalysis?.brandVoice ?? []),
    ...(brandVoiceDoc?.principles.map((principle) => principle.label) ?? []),
  ];

  const uniqueVoiceSignals = [...new Set(voiceSignals)].slice(0, 6);
  const notes = [
    "Primary content workflow is a poster graphic plus social copy package.",
    "Default publishing flow assumes manual copy-paste into Instagram, X, and design tools like Illustrator.",
    brandVoiceDoc?.identity ? `Voice identity: ${brandVoiceDoc.identity}` : undefined,
    insights?.positioningAdvice
      ? `Positioning advice: ${insights.positioningAdvice}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    brandName: productAnalysis?.brandName ?? brand.title,
    oneLiner: productAnalysis?.oneLiner ?? brand.description,
    targetAudience: productAnalysis?.targetAudience.join(", "),
    siteUrl: siteUrl ?? undefined,
    brandVoice: uniqueVoiceSignals,
    campaignGoal:
      "Turn research into a reusable poster asset and sharp social ad copy.",
    competitors: competitors.map((competitor) => competitor.domain),
    brandTheme: "Marketing operator",
    preferredChannels: ["Instagram", "X"],
    publishingTool: "Manual social distribution",
    notes,
  };
}

function useAnalysisPipeline({
  accessToken,
  authRequired,
}: {
  accessToken?: string;
  authRequired: boolean;
}) {
  const [state, setState] = useState<AnalysisState>(initialAnalysisState);
  const abortRef = useRef<AbortController | null>(null);

  const startAnalysis = useCallback(
    async (siteUrl: string) => {
      abortRef.current?.abort();
      setState({ ...initialAnalysisState, isRunning: true, currentStep: 1, stepLabel: "Starting analysis..." });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ siteUrl }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setState((prev) => ({
            ...prev,
            isRunning: false,
            errors: [{ step: 0, message: `Request failed: ${res.status}` }],
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes("\n\n")) {
            const idx = buffer.indexOf("\n\n");
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            const eventMatch = raw.match(/^event:\s*(.+)/m);
            const dataMatch = raw.match(/^data:\s*(.+)/m);
            if (!eventMatch || !dataMatch) continue;

            const eventName = eventMatch[1].trim();
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(dataMatch[1]);
            } catch {
              continue;
            }

            switch (eventName) {
              case "step":
                setState((prev) => ({
                  ...prev,
                  currentStep: (data.step as number) ?? prev.currentStep,
                  stepLabel: (data.label as string) ?? prev.stepLabel,
                }));
                break;
              case "product-analysis":
                setState((prev) => ({
                  ...prev,
                  productAnalysis: data as unknown as ProductAnalysis,
                }));
                break;
              case "competitors-found":
                setState((prev) => ({
                  ...prev,
                  competitors: data as unknown as CompetitorRecord[],
                }));
                break;
              case "competitor-analysis":
                setState((prev) => ({
                  ...prev,
                  competitorAnalyses: [
                    ...prev.competitorAnalyses,
                    data as unknown as CompetitorAnalysis,
                  ],
                }));
                break;
              case "insights":
                setState((prev) => ({
                  ...prev,
                  insights: data as unknown as CompetitiveInsights,
                }));
                break;
              case "error":
                setState((prev) => ({
                  ...prev,
                  errors: [
                    ...prev.errors,
                    {
                      step: (data.step as number | string) ?? "unknown",
                      message: (data.message as string) ?? "Unknown error",
                    },
                  ],
                }));
                break;
              case "done":
                setState((prev) => ({ ...prev, isRunning: false, currentStep: 0 }));
                break;
            }
          }
        }

        setState((prev) => ({ ...prev, isRunning: false }));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState((prev) => ({
            ...prev,
            isRunning: false,
            errors: [
              ...prev.errors,
              { step: 0, message: (err as Error).message ?? "Analysis failed" },
            ],
          }));
        }
      }
    },
    [accessToken],
  );

  const stopAnalysis = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isRunning: false }));
  }, []);

  const hydrateState = useCallback((nextState: Partial<AnalysisState>) => {
    setState((prev) => ({ ...prev, ...nextState }));
  }, []);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    setState(initialAnalysisState);
  }, []);

  return { ...state, startAnalysis, stopAnalysis, hydrateState, resetState };
}

/* ------------------------------------------------------------------ */

export type DashboardProps = Record<string, never>;

const DEFAULT_TERMINAL_SESSION_NAME = "Friday";

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function trimSentence(value: string, maxLength: number) {
  return truncateText(value.replace(/\s+/g, " ").replace(/[.?!]+$/, ""), maxLength);
}

function wrapPosterText(value: string, maxChars: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word.slice(0, maxChars));
      currentLine = word.slice(maxChars);
    }

    if (lines.length === maxLines) {
      return [
        ...lines.slice(0, maxLines - 1),
        truncateText([currentLine, ...words.slice(index + 1)].join(" "), maxChars),
      ];
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  return [
    ...lines.slice(0, maxLines - 1),
    truncateText(lines.slice(maxLines - 1).join(" "), maxChars),
  ];
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPosterAsset({
  brand,
  insights,
  productAnalysis,
  siteUrl,
  userPrompt,
}: {
  brand: BrandMeta;
  insights: CompetitiveInsights | null;
  productAnalysis: ProductAnalysis | null;
  siteUrl: string | null;
  userPrompt: string | null;
}): PosterAsset {
  const headlineSource =
    productAnalysis?.differentiators[0] ??
    insights?.positioningAdvice ??
    productAnalysis?.oneLiner ??
    brand.description ??
    `${brand.title} campaign poster`;
  const subheadlineSource =
    productAnalysis?.positioning ??
    productAnalysis?.oneLiner ??
    brand.description ??
    "Turn the strongest product angle into a social-ready poster.";
  const audience = productAnalysis?.targetAudience[0];
  const proofPoints = [
    ...(productAnalysis?.differentiators ?? []),
    ...(insights?.opportunities ?? []),
    ...(productAnalysis?.painPoints ?? []),
  ]
    .map((item) => trimSentence(item, 34))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 3);

  return {
    eyebrow: trimSentence(
      userPrompt || (audience ? `Built for ${audience}` : "Poster asset"),
      34,
    ),
    headline: trimSentence(headlineSource, 56),
    subheadline: trimSentence(subheadlineSource, 118),
    proofPoints:
      proofPoints.length > 0
        ? proofPoints
        : [
            trimSentence(productAnalysis?.primaryCta || "Manual social package", 34),
            "Instagram and X ready",
          ],
    cta: trimSentence(productAnalysis?.primaryCta || "See how it works", 28),
    footer: trimSentence(
      siteUrl ? getSiteDomain(siteUrl).replace(/^www\./, "") : brand.title,
      30,
    ),
  };
}

function formatPosterText(asset: PosterAsset) {
  return [
    `Eyebrow: ${asset.eyebrow}`,
    `Headline: ${asset.headline}`,
    `Subheadline: ${asset.subheadline}`,
    `Proof points: ${asset.proofPoints.join(" | ")}`,
    `CTA: ${asset.cta}`,
    `Footer: ${asset.footer}`,
  ].join("\n");
}

function buildPosterSvg(asset: PosterAsset) {
  const headlineLines = wrapPosterText(asset.headline, 16, 3);
  const subheadlineLines = wrapPosterText(asset.subheadline, 34, 3);
  const headlineTspans = headlineLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : 88;
      return `<tspan x="96" dy="${dy}">${escapeSvgText(line)}</tspan>`;
    })
    .join("");
  const subheadlineTspans = subheadlineLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : 40;
      return `<tspan x="96" dy="${dy}">${escapeSvgText(line)}</tspan>`;
    })
    .join("");
  const proofMarkup = asset.proofPoints
    .slice(0, 3)
    .map((point, index) => {
      const y = 650 + index * 74;
      return `
        <rect x="96" y="${y}" width="420" height="52" rx="26" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.12)" />
        <text x="122" y="${y + 33}" font-size="22" fill="#fef3c7" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">${escapeSvgText(point)}</text>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="${escapeSvgText(asset.headline)}">
      <defs>
        <linearGradient id="poster-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#091a28" />
          <stop offset="55%" stop-color="#102f43" />
          <stop offset="100%" stop-color="#1b4d3e" />
        </linearGradient>
        <radialGradient id="poster-orb" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fb923c" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#fb923c" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1080" height="1080" fill="url(#poster-bg)" />
      <circle cx="860" cy="180" r="240" fill="url(#poster-orb)" />
      <circle cx="966" cy="948" r="188" fill="rgba(254,243,199,0.08)" />
      <rect x="72" y="72" width="936" height="936" rx="48" fill="none" stroke="rgba(255,255,255,0.14)" />
      <text x="96" y="150" font-size="24" letter-spacing="4" font-weight="700" fill="#fcd34d" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">${escapeSvgText(asset.eyebrow.toUpperCase())}</text>
      <text x="96" y="272" font-size="82" font-weight="800" fill="#f8fafc" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">${headlineTspans}</text>
      <text x="96" y="528" font-size="34" fill="#d7e6ee" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">${subheadlineTspans}</text>
      ${proofMarkup}
      <rect x="96" y="912" width="302" height="74" rx="37" fill="#f97316" />
      <text x="128" y="958" font-size="30" font-weight="700" fill="#fff7ed" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">${escapeSvgText(asset.cta)}</text>
      <text x="760" y="954" font-size="24" letter-spacing="3" font-weight="700" fill="#d7e6ee" text-anchor="end" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">${escapeSvgText(asset.footer.toUpperCase())}</text>
      <text x="984" y="954" font-size="24" fill="#fef3c7" text-anchor="end" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">POSTER</text>
    </svg>
  `.trim();
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}


function getDisplayName(session: Session | null) {
  const fullName = session?.user.user_metadata.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const email = session?.user.email;
  if (!email) {
    return "Friday";
  }

  return email.split("@")[0] ?? email;
}

function getAvatarUrl(session: Session | null) {
  const metadata = session?.user.user_metadata;
  const candidates = [
    metadata?.avatar_url,
    metadata?.picture,
    metadata?.photoURL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getInitials(value: string) {
  const parts = value
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "FR";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function AuthControl({
  authEnabled,
  isAuthLoading,
  isMenuOpen,
  onOpenAuth,
  onSignOut,
  onToggleMenu,
  session,
}: {
  authEnabled: boolean;
  isAuthLoading: boolean;
  isMenuOpen: boolean;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onToggleMenu: () => void;
  session: Session | null;
}) {
  if (!authEnabled) {
    return (
      <div className="user-badge user-badge-static">
        <div className="auth-pill-copy">
          <span>Preview mode</span>
        </div>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="user-badge user-badge-static">
        <div className="user-avatar text-xs">
          <Loader2 className="spin" style={{ width: 12, height: 12 }} />
        </div>
        <div className="auth-pill-copy">
          <span>Checking access</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <button type="button" className="user-badge" onClick={onOpenAuth}>
        <div className="user-avatar ">IN</div>
        <div className="auth-pill-copy">
          <span className="text-xs">Sign in</span>
        </div>
      </button>
    );
  }

  const displayName = getDisplayName(session);
  const avatarUrl = getAvatarUrl(session);
  const initials = getInitials(displayName);

  return (
    <div className="auth-menu-shell">
      <button type="button" className="user-badge" onClick={onToggleMenu}>
        <div className="user-avatar text-xs">
          {avatarUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={displayName} className="user-avatar-image" />
            </>
          ) : (
            initials
          )}
        </div>
        <div className="auth-pill-copy">
          <span>{displayName}</span>
        </div>
      </button>

      {isMenuOpen && (
        <div className="auth-menu">
          <div className="auth-menu-header">
            <div className="auth-menu-title">Authenticated</div>
            <div className="auth-menu-email">{session.user.email}</div>
          </div>
          <button type="button" className="auth-menu-action" onClick={onSignOut}>
            <LogOut style={{ width: 14, height: 14 }} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AuthModal({
  email,
  error,
  isGoogleLoading,
  isOpen,
  isSendingLink,
  linkSentTo,
  onClose,
  onEmailChange,
  onGoogleSignIn,
  onSubmit,
}: {
  email: string;
  error: string | null;
  isGoogleLoading: boolean;
  isOpen: boolean;
  isSendingLink: boolean;
  linkSentTo: string | null;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onGoogleSignIn: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-modal-header">
          <div>
            <div className="auth-modal-eyebrow">Protected Workspace</div>
            <h2 id="auth-modal-title" className="auth-modal-title">
              Sign in to Friday
            </h2>
          </div>
          <button type="button" className="auth-modal-close" onClick={onClose}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <p className="auth-modal-copy">
          Sign in with Google or use a Supabase magic link to unlock the dashboard
          and attach your chat session to an authenticated user.
        </p>

        <button
          type="button"
          className="auth-secondary-btn"
          onClick={onGoogleSignIn}
          disabled={isGoogleLoading || isSendingLink}
        >
          <Chrome style={{ width: 16, height: 16 }} />
          <span>{isGoogleLoading ? "Redirecting to Google..." : "Continue with Google"}</span>
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-form-label" htmlFor="auth-email">
            Work email
          </label>
          <div className="auth-form-field">
            <Mail style={{ width: 16, height: 16, color: "var(--muted)" }} />
            <input
              id="auth-email"
              type="email"
              className="auth-form-input"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <button type="submit" className="auth-primary-btn" disabled={isSendingLink}>
            {isSendingLink ? "Sending magic link..." : "Send magic link"}
          </button>
        </form>

        {linkSentTo && (
          <div className="auth-form-help auth-form-help-success">
            Magic link sent to <strong>{linkSentTo}</strong>. Open the email on
            this device to finish sign-in.
          </div>
        )}

        {error && <div className="auth-form-help auth-form-help-error">{error}</div>}
      </div>
    </div>
  );
}

export function Dashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    authEnabled,
    session,
    isAuthLoading,
    isLocked,
    canLoadWorkspace,
    authError: contextAuthError,
    isAuthModalOpen,
    authEmail,
    linkSentTo,
    isSendingLink,
    isGoogleLoading,
    openAuthModal,
    closeAuthModal,
    setAuthEmail,
    setAuthError: setContextAuthError,
    handleSendMagicLink,
    handleGoogleSignIn,
    handleSignOut,
  } = useAuth();

  const [terminalInput, setTerminalInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [currentSiteUrl, setCurrentSiteUrl] = useState<string | null>(null);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorRecord[]>([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [isDiscoveringCompetitors, setIsDiscoveringCompetitors] = useState(false);
  const [brandVoiceDoc, setBrandVoiceDoc] = useState<BrandVoiceDoc | null>(null);
  const [isBrandVoiceLoading, setIsBrandVoiceLoading] = useState(false);
  const [brandVoiceError, setBrandVoiceError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const [selectedAdFormat, setSelectedAdFormat] = useState<AdFormat>("instagram-post");
  const [generatedAds, setGeneratedAds] = useState<GeneratedAdImage[]>([]);
  const [isGeneratingAd, setIsGeneratingAd] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [adPrompt, setAdPrompt] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasHydratedWorkspaceState, setHasHydratedWorkspaceState] = useState(false);
  const isSiteLoaded = Boolean(currentSiteUrl);
  const singlePageWorkflow = true;
  const brand = useBrandMeta(currentSiteUrl);
  const attemptedDiscoveryRef = useRef(false);
  const resumedAnalysisRef = useRef(false);

  const isDashboardEntryRoute = pathname === "/dashboard";
  const isWorkspaceSetupRoute = pathname === "/workspace/setup";
  const isWorkspaceRoute = pathname === "/workspace";

  const analysis = useAnalysisPipeline({
    accessToken: session?.access_token,
    authRequired: authEnabled,
  });
  const hydrateAnalysisState = analysis.hydrateState;
  const resetAnalysisState = analysis.resetState;
  const startSiteAnalysis = analysis.startAnalysis;

  // Redirect to landing if not authenticated
  useEffect(() => {
    if (authEnabled && !isAuthLoading && !session) {
      clearStoredWorkspaceState();
      router.replace("/");
    }
  }, [authEnabled, isAuthLoading, session, router]);

  useEffect(() => {
    if (!isWorkspaceSetupRoute && !isWorkspaceRoute) {
      setHasHydratedWorkspaceState(true);
      return;
    }

    const storedState = readStoredWorkspaceState();

    if (storedState) {
      setCurrentSiteUrl(storedState.siteUrl);
      setCompetitors(normalizeCompetitorRecords(storedState.competitors));
      setBrandVoiceDoc(storedState.brandVoiceDoc);
      hydrateAnalysisState({
        ...storedState.analysis,
        competitors: normalizeCompetitorRecords(storedState.analysis.competitors),
        isRunning: false,
      });
      setTerminalInput(storedState.siteUrl ?? "");
    } else {
      setCurrentSiteUrl(null);
      setCompetitors([]);
      setBrandVoiceDoc(null);
      resetAnalysisState();
      setTerminalInput("");
    }

    resumedAnalysisRef.current = false;
    setHasHydratedWorkspaceState(true);
  }, [
    hydrateAnalysisState,
    isWorkspaceRoute,
    isWorkspaceSetupRoute,
    resetAnalysisState,
  ]);

  const currentDomain = currentSiteUrl ? getSiteDomain(currentSiteUrl) : "";
  const workspaceDomain = currentDomain.replace(/^www\./, "");
  const workspaceTitle =
    brand.title && brand.title !== "Website" ? brand.title : workspaceDomain || "Workspace";
  const displayName = getDisplayName(session);
  const avatarUrl = getAvatarUrl(session);
  const userInitials = getInitials(displayName);
  const latestAssistantMessage =
    [...chatMessages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim()) ?? null;
  const latestUserMessage =
    [...chatMessages].reverse().find((message) => message.role === "user") ?? null;
  const posterAsset = buildPosterAsset({
    brand,
    insights: analysis.insights,
    productAnalysis: analysis.productAnalysis,
    siteUrl: currentSiteUrl,
    userPrompt: latestUserMessage?.content ?? null,
  });
  const posterText = formatPosterText(posterAsset);
  const posterSvg = buildPosterSvg(posterAsset);
  const posterPreviewSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(posterSvg)}`;
  const insightCount = analysis.insights
    ? analysis.insights.opportunities.length +
      analysis.insights.gaps.length +
      analysis.insights.recommendations.length
    : 0;
  const workflowOverview = [
    {
      label: "Website",
      value: workspaceDomain || "Loaded",
      note: "Source imported into the workspace",
    },
    {
      label: "Marketing",
      value: chatMessages.length > 0 ? `${chatMessages.length} prompts` : "Ready",
      note: "AI operator for content creation",
    },
    {
      label: "Research",
      value: analysis.productAnalysis ? "Ready" : analysis.isRunning ? "Running" : "Pending",
      note: "Positioning, audience, and differentiators",
    },
    {
      label: "Competitors",
      value: competitors.length > 0 ? `${competitors.length} tracked` : "Pending",
      note: "Market landscape and comparison",
    },
    {
      label: "Voice",
      value: brandVoiceDoc ? "Ready" : isBrandVoiceLoading ? "Drafting" : "Pending",
      note: "Tone rules and rewrite guidance",
    },
    {
      label: "Strategy",
      value: insightCount > 0 ? `${insightCount} notes` : "Pending",
      note: "Campaign angles and next moves",
    },
  ];
  const outlineItems: Array<{
    view: ViewType;
    label: string;
    status?: string;
    complete?: boolean;
  }> = [
    {
      view: "marketing-console",
      label: "Marketing Console",
      status: chatMessages.length > 0 ? `${chatMessages.length} messages` : "Ready",
      complete: chatMessages.length > 0,
    },
    {
      view: "company-report",
      label: "Company Report",
      status: currentDomain || "Overview",
    },
    {
      view: "product-information",
      label: "Product Information",
      status: analysis.productAnalysis ? "Ready" : "Pending",
      complete: Boolean(analysis.productAnalysis),
    },
    {
      view: "competitor-analysis",
      label: "Competitor Analysis",
      status: competitors.length > 0 ? `${competitors.length} tracked` : "Pending",
      complete: competitors.length > 0,
    },
    {
      view: "brand-voice",
      label: "Brand Voice",
      status: brandVoiceDoc ? "Ready" : isBrandVoiceLoading ? "Drafting" : "Pending",
      complete: Boolean(brandVoiceDoc),
    },
    {
      view: "strategic-insights",
      label: "Strategic Insights",
      status: insightCount > 0 ? `${insightCount} notes` : "Pending",
      complete: Boolean(analysis.insights),
    },
  ];
  const pipelineSteps = [
    { step: 1, label: "Product Analysis" },
    { step: 2, label: "Competitor Discovery" },
    { step: 3, label: "Competitor Analysis" },
    { step: 4, label: "Strategic Insights" },
  ];
  const landingExamples = [
    "https://linear.app",
    "https://www.notion.so",
    "https://www.reddit.com",
  ];
  const dashboardEntrySections = [
    {
      title: "Company Report",
      copy:
        "A structured company read with product positioning, key signals, and the working summary that anchors the rest of the dashboard.",
    },
    {
      title: "Competitor Analysis",
      copy:
        "Direct competitor discovery, comparison notes, and market framing so the research is grounded in the actual landscape.",
    },
    {
      title: "Brand Voice",
      copy:
        "Voice principles, messaging direction, and reusable language guidance that feeds the later creative work.",
    },
    {
      title: "Strategic Insights",
      copy:
        "Campaign angles, gaps, and next actions pulled together after the product and competitor reads are complete.",
    },
  ];
  const dashboardEntryWorkflow = [
    {
      title: "Authenticate",
      note: "Friday keeps the workspace protected until the session is valid.",
    },
    {
      title: "Paste the company URL",
      note: "One URL is enough to start the product, competitor, and messaging pipeline.",
    },
    {
      title: "Open the full dashboard",
      note: "The report fills in with research and the operating tools you need next.",
    },
  ];
  const marketingPromptSuggestions = [
    `Create a square poster headline and caption for ${brand.title}.`,
    `Write the Instagram caption and X post that go with a ${brand.title} launch graphic.`,
    `Turn ${brand.title}'s strongest competitive angle into a poster and ad copy package.`,
  ];

  const terminalInputRef = useRef<HTMLInputElement>(null);
  const authMenuRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const handleCopyAction = useCallback(async (key: string, value: string) => {
    try {
      await copyText(value);
      setCopiedKey(key);
      setTerminalError(null);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1800);
    } catch (error) {
      setTerminalError(
        error instanceof Error ? error.message : "Could not copy to the clipboard.",
      );
    }
  }, []);

  const handleDownloadPoster = useCallback(() => {
    try {
      const blob = new Blob([posterSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${workspaceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "poster"}-poster.svg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setTerminalError(null);
    } catch (error) {
      setTerminalError(
        error instanceof Error ? error.message : "Could not download the poster graphic.",
      );
    }
  }, [posterSvg, workspaceTitle]);

  const runMarketingPrompt = useCallback(
    async (rawPrompt: string) => {
      const prompt = rawPrompt.trim();
      if (!prompt || isChatLoading) {
        return;
      }

      const assistantMessageId = `assistant-${Date.now()}`;
      const brandContext = buildMarketingContext({
        brand,
        brandVoiceDoc,
        competitors,
        productAnalysis: analysis.productAnalysis,
        insights: analysis.insights,
        siteUrl: currentSiteUrl,
      });

      setCurrentView("marketing-console");
      setChatMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: prompt },
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);
      setIsChatLoading(true);
      setChatInput("");
      setTerminalError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({
            message: prompt,
            agentId: "cmo",
            brandContext,
          }),
        });

        if (!res.ok || !res.body) {
          const errorBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorBody.error ?? `Request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) {
            continue;
          }

          setChatMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${chunk}` }
                : message,
            ),
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Marketing console request failed.";
        setChatMessages((prev) =>
          prev.map((entry) =>
            entry.id === assistantMessageId
              ? { ...entry, content: `Error: ${message}` }
              : entry,
          ),
        );
      } finally {
        setIsChatLoading(false);
      }
    },
    [
      analysis.insights,
      analysis.productAnalysis,
      brandVoiceDoc,
      brand,
      competitors,
      currentSiteUrl,
      isChatLoading,
      session?.access_token,
    ],
  );

  const generateBrandVoice = useCallback(async () => {
    if (!currentSiteUrl || isBrandVoiceLoading) return;
    setIsBrandVoiceLoading(true);
    setBrandVoiceError(null);
    try {
      const res = await fetch("/api/brand-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: currentSiteUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error ?? "Request failed");
      }
      const doc = (await res.json()) as BrandVoiceDoc;
      setBrandVoiceDoc(doc);
    } catch (err) {
      setBrandVoiceError(err instanceof Error ? err.message : "Failed to generate brand voice");
    } finally {
      setIsBrandVoiceLoading(false);
    }
  }, [currentSiteUrl, isBrandVoiceLoading]);

  const generateBrandAd = useCallback(async () => {
    if (!currentSiteUrl || isGeneratingAd) return;
    setIsGeneratingAd(true);
    setAdError(null);
    try {
      const res = await fetch("/api/brand-ads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          siteUrl: currentSiteUrl,
          format: selectedAdFormat,
          prompt: adPrompt.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error ?? "Request failed");
      }

      const data = (await res.json()) as GeneratedAdImage;
      setGeneratedAds((prev) => [data, ...prev]);
      setAdPrompt("");
    } catch (err) {
      setAdError(err instanceof Error ? err.message : "Failed to generate ad");
    } finally {
      setIsGeneratingAd(false);
    }
  }, [currentSiteUrl, isGeneratingAd, selectedAdFormat, adPrompt, session?.access_token]);

  const terminalSessionName = currentSiteUrl
    ? truncateText(currentSiteUrl, 48)
    : DEFAULT_TERMINAL_SESSION_NAME;
  const showWorkspaceEntry = !isSiteLoaded;
  const visibleAuthError = contextAuthError ?? terminalError;
  const dashboardEntryFacts = [
    {
      label: "Access",
      value: canLoadWorkspace ? "Authenticated" : "Sign in required",
      note: canLoadWorkspace
        ? "The dashboard is unlocked and ready for a company URL."
        : "Authentication happens first, then the URL input unlocks.",
    },
    {
      label: "Input",
      value: canLoadWorkspace ? "URL field ready" : "Locked until auth",
      note: "Paste one company website and Friday builds the full workspace from it.",
    },
    {
      label: "Output",
      value: "Research + assets",
      note: "Company report, competitors, brand voice, strategy, and creative output.",
    },
    {
      label: "View",
      value: "One dashboard",
      note: "Everything opens inside the same operating view instead of separate landing flows.",
    },
  ];
  const terminalStatus = isAuthLoading
    ? "Checking session"
    : isLocked
      ? "Authentication required"
      : analysis.isRunning
        ? analysis.stepLabel || "Running analysis"
        : isSiteLoaded
          ? "Site loaded"
          : "Load a website to start";

  // Sync pipeline competitor results to the left-column list
  useEffect(() => {
    if (analysis.competitors && analysis.competitors.length > 0) {
      setCompetitors(normalizeCompetitorRecords(analysis.competitors));
    }
  }, [analysis.competitors]);

  // Auto-discover competitors when a site is loaded
  useEffect(() => {
    if (!currentSiteUrl) return;
    if (competitors.length > 0 || isDiscoveringCompetitors) return;
    if (analysis.isRunning || analysis.competitors) return;
    if (attemptedDiscoveryRef.current) return;
    if (authEnabled && !session?.access_token) return;

    let cancelled = false;
    attemptedDiscoveryRef.current = true;
    setCompetitorError(null);
    setIsDiscoveringCompetitors(true);

    void (async () => {
      try {
        const res = await fetch("/api/competitors", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({
            brandName: brand.title,
            oneLiner: brand.description,
            siteUrl: currentSiteUrl,
          }),
        });

        if (cancelled) return;

        if (!res.ok) {
          const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
          setCompetitorError(
            errorBody.error || "Could not discover competitors automatically.",
          );
          return;
        }

        const data = (await res.json()) as {
          summary?: string;
          competitors?: unknown;
          error?: string;
        };
        if (cancelled) return;

        const nextCompetitors = normalizeCompetitorRecords(data.competitors);
        if (!nextCompetitors.length) {
          setCompetitorError(
            data.error || "No competitors were found for this website yet.",
          );
          return;
        }

        setCompetitors(nextCompetitors);
      } catch {
        if (!cancelled) {
          setCompetitorError(
            "Competitor discovery failed. Retry or add competitor domains manually.",
          );
        }
      } finally {
        if (!cancelled) setIsDiscoveringCompetitors(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    authEnabled,
    brand.description,
    brand.title,
    competitorError,
    competitors.length,
    currentSiteUrl,
    isDiscoveringCompetitors,
    analysis.competitors,
    analysis.isRunning,
    session?.access_token,
  ]);

  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
    setIsChatLoading(false);
    setCopiedKey(null);
    setCurrentView("home");
    setGeneratedAds([]);
    setAdError(null);
    setAdPrompt("");
  }, [currentSiteUrl]);

  useEffect(() => {
    if (!hasHydratedWorkspaceState || (!isWorkspaceSetupRoute && !isWorkspaceRoute)) {
      return;
    }

    if (!currentSiteUrl && !analysis.productAnalysis) {
      return;
    }

    writeStoredWorkspaceState({
      version: 1,
      siteUrl: currentSiteUrl,
      competitors,
      brandVoiceDoc,
      analysis: {
        isRunning: analysis.isRunning,
        currentStep: analysis.currentStep,
        stepLabel: analysis.stepLabel,
        productAnalysis: analysis.productAnalysis,
        competitors: analysis.competitors,
        competitorAnalyses: analysis.competitorAnalyses,
        insights: analysis.insights,
        errors: analysis.errors,
      },
    });
  }, [
    analysis.competitorAnalyses,
    analysis.competitors,
    analysis.currentStep,
    analysis.errors,
    analysis.insights,
    analysis.isRunning,
    analysis.productAnalysis,
    analysis.stepLabel,
    brandVoiceDoc,
    competitors,
    currentSiteUrl,
    hasHydratedWorkspaceState,
    isWorkspaceRoute,
    isWorkspaceSetupRoute,
  ]);

  useEffect(() => {
    if (
      !isWorkspaceSetupRoute ||
      !hasHydratedWorkspaceState ||
      !currentSiteUrl ||
      analysis.productAnalysis ||
      analysis.isRunning ||
      resumedAnalysisRef.current
    ) {
      return;
    }

    resumedAnalysisRef.current = true;
    void startSiteAnalysis(currentSiteUrl);
  }, [
    analysis.isRunning,
    analysis.productAnalysis,
    currentSiteUrl,
    startSiteAnalysis,
    hasHydratedWorkspaceState,
    isWorkspaceSetupRoute,
  ]);

  useEffect(() => {
    if (!isWorkspaceRoute || !hasHydratedWorkspaceState) {
      return;
    }

    if (!currentSiteUrl) {
      router.replace("/dashboard");
      return;
    }

    if (!analysis.productAnalysis) {
      router.replace("/workspace/setup");
    }
  }, [
    analysis.productAnalysis,
    currentSiteUrl,
    hasHydratedWorkspaceState,
    isWorkspaceRoute,
    router,
  ]);

  useEffect(() => {
    if (!isSiteLoaded) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [isSiteLoaded]);

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    if (isLocked || isAuthLoading) {
      return;
    }

    terminalInputRef.current?.focus();
  }, [isAuthLoading, isLocked]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (
        isAuthMenuOpen &&
        authMenuRef.current &&
        !authMenuRef.current.contains(event.target as Node)
      ) {
        setIsAuthMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsAuthMenuOpen(false);
      closeAuthModal();
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAuthMenuOpen]);

  function beginWorkspaceSetup() {
    clearStoredWorkspaceState();
    resumedAnalysisRef.current = false;
    setTerminalError(null);
    setCurrentSiteUrl(null);
    setCompetitors([]);
    setBrandVoiceDoc(null);
    setBrandVoiceError(null);
    setIsBrandVoiceLoading(false);
    resetAnalysisState();
    router.push("/workspace/setup");
  }

  function handleTerminalSubmit(event?: FormEvent) {
    event?.preventDefault();

    if (isLocked) {
      openAuthModal();
      return;
    }

    if (!terminalInput.trim()) {
      return;
    }

    const nextSiteUrl = extractSiteUrl(terminalInput);
    if (!nextSiteUrl) {
      setTerminalError("Paste a valid website URL in the terminal input.");
      return;
    }

    setTerminalError(null);
    resumedAnalysisRef.current = true;
    setCompetitors([]);
    setBrandVoiceDoc(null);
    setBrandVoiceError(null);
    setIsBrandVoiceLoading(false);
    setCurrentSiteUrl(nextSiteUrl);
    setTerminalInput("");
    void startSiteAnalysis(nextSiteUrl);
  }

  function handleChatSubmit(event?: FormEvent, presetPrompt?: string) {
    event?.preventDefault();

    if (isLocked) {
      openAuthModal();
      return;
    }

    if (!currentSiteUrl) {
      setTerminalError("Load a website before using the marketing console.");
      return;
    }

    const prompt = presetPrompt ?? chatInput;
    void runMarketingPrompt(prompt);
  }

  function addCompetitor(domain: string) {
    const competitor = normalizeCompetitorRecord(domain);
    if (!competitor || competitors.some((entry) => entry.domain === competitor.domain)) {
      return;
    }

    setCompetitors((prev) => [...prev, competitor]);
  }

  function removeCompetitor(domain: string) {
    setCompetitors((prev) => prev.filter((competitor) => competitor.domain !== domain));
  }

  function retryCompetitorDiscovery() {
    if (!currentSiteUrl) return;
    attemptedDiscoveryRef.current = false;
    setCompetitors([]);
    setCompetitorError(null);
  }

  function renderSidebar() {
    return (
      <div className="report-sidebar">
        <section className="card report-section">
          <div className="card-header">
            <div className="section-heading">
              <div className="section-kicker">Outline</div>
              <span>Report sections</span>
            </div>
          </div>
          {outlineItems.map((item) => (
            <button
              key={item.view}
              type="button"
              className={`list-item list-item-button${
                currentView === item.view ? " list-item-active" : ""
              }`}
              onClick={() => setCurrentView(item.view)}
            >
              <div className="flex items-center">
                <FileText className="icon" />
                <span className="text-sm">{item.label}</span>
              </div>
              {item.complete ? (
                <CheckCircle
                  style={{ width: 14, height: 14, color: "var(--success)" }}
                />
              ) : (
                <span className="status-chip">{item.status}</span>
              )}
            </button>
          ))}
        </section>

        <section className="card report-section">
          <div className="card-header">
            <div className="section-heading">
              <div className="section-kicker">Pipeline</div>
              <span>Analysis progress</span>
            </div>
          </div>
          <div className="card-body" style={{ padding: "8px 16px" }}>
            {pipelineSteps.map(({ step, label }) => {
              const isDone =
                (step === 1 && analysis.productAnalysis !== null) ||
                (step === 2 && analysis.competitors !== null) ||
                (step === 3 &&
                  !analysis.isRunning &&
                  analysis.competitorAnalyses.length > 0 &&
                  analysis.currentStep !== 3) ||
                (step === 4 && analysis.insights !== null);
              const isActive = analysis.isRunning && analysis.currentStep === step;
              const status = isDone ? "done" : isActive ? "running" : "pending";

              return (
                <div key={step} className={`step-indicator ${status}`}>
                  <div className="step-icon">
                    {status === "done" ? (
                      <CheckCircle style={{ width: 16, height: 16 }} />
                    ) : status === "running" ? (
                      <Loader2 className="spin" style={{ width: 16, height: 16 }} />
                    ) : (
                      <div className="step-icon-empty" />
                    )}
                  </div>
                  <div className="step-label">
                    {isActive ? analysis.stepLabel : label}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {analysis.errors.length > 0 && (
          <section className="card report-section">
            <div className="card-header">
              <div className="section-heading">
                <div className="section-kicker">Errors</div>
                <span>What needs attention</span>
              </div>
            </div>
            <div className="card-body">
              {analysis.errors.map((e, index) => (
                <div key={index} className="report-error-row">
                  Step {e.step}: {e.message}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const setupInitialStep: WizardStep = isDashboardEntryRoute
    ? 1
    : analysis.productAnalysis
      ? 4
      : currentSiteUrl
        ? 3
        : 2;

  if (isDashboardEntryRoute) {
    return (
      <OnboardingWizard
        initialStep={1}
        isAnalysisRunning={false}
        terminalInput=""
        visibleAuthError={visibleAuthError}
        terminalInputRef={terminalInputRef}
        onInputChange={() => {}}
        onSubmit={() => {}}
        landingExamples={landingExamples}
        analysisCurrentStep={0}
        stepLabel=""
        productAnalysis={null}
        analysisErrors={[]}
        onContinueFromStep1={beginWorkspaceSetup}
        onComplete={beginWorkspaceSetup}
      />
    );
  }

  if (isWorkspaceSetupRoute) {
    if (!hasHydratedWorkspaceState) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
          Preparing workspace setup...
        </div>
      );
    }

    return (
      <OnboardingWizard
        initialStep={setupInitialStep}
        isAnalysisRunning={analysis.isRunning}
        terminalInput={terminalInput}
        visibleAuthError={visibleAuthError}
        terminalInputRef={terminalInputRef}
        onInputChange={(value) => {
          setTerminalInput(value);
          setTerminalError(null);
        }}
        onSubmit={handleTerminalSubmit}
        landingExamples={landingExamples}
        analysisCurrentStep={analysis.currentStep}
        stepLabel={analysis.stepLabel ?? ""}
        productAnalysis={analysis.productAnalysis}
        analysisErrors={analysis.errors}
        onBackFromStep2={() => router.push("/dashboard")}
        onComplete={() => router.push("/workspace")}
      />
    );
  }

  if (isWorkspaceRoute) {
    if (!hasHydratedWorkspaceState || !currentSiteUrl || !analysis.productAnalysis) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
          Loading workspace...
        </div>
      );
    }

    return (
      <Workspace
        siteUrl={currentSiteUrl}
        productAnalysis={analysis.productAnalysis}
        competitors={competitors}
        competitorAnalyses={analysis.competitorAnalyses}
        insights={analysis.insights}
        brandVoiceDoc={brandVoiceDoc}
        brandContext={buildMarketingContext({
          brand,
          brandVoiceDoc,
          competitors,
          productAnalysis: analysis.productAnalysis,
          insights: analysis.insights,
          siteUrl: currentSiteUrl,
        })}
      />
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark">🦸</div>
          <div className="dashboard-brand-copy">
            <div className="dashboard-brand-name">Friday</div>
            <div className="dashboard-brand-subtitle">
              Research, poster assets, and social copy
            </div>
          </div>
        </div>

        <div ref={authMenuRef}>
          <AuthControl
            authEnabled={authEnabled}
            isAuthLoading={isAuthLoading}
            isMenuOpen={isAuthMenuOpen}
            onOpenAuth={openAuthModal}
            onSignOut={handleSignOut}
            onToggleMenu={() => setIsAuthMenuOpen((open) => !open)}
            session={session}
          />
        </div>
      </div>

      {isSiteLoaded && (
        <div className="workspace-bar card">
          <div className="card-body workspace-bar-body">
            <div className="workspace-bar-copy">
              <div className="workspace-bar-label">Loaded website</div>
              <div className="workspace-bar-title-row">
                <div className="workspace-bar-title">{workspaceTitle}</div>
                {workspaceDomain && <span className="status-chip">{workspaceDomain}</span>}
              </div>
              <p className="workspace-bar-text">{currentSiteUrl}</p>
            </div>

            <div className="workspace-bar-summary">
              <div className="workspace-bar-badges">
                <span className="status-chip status-chip-accent">{terminalStatus}</span>
                {analysis.currentStep > 0 && analysis.currentStep <= 4 && (
                  <span className="status-chip">Step {analysis.currentStep} of 4</span>
                )}
                <span className="status-chip">
                  {analysis.isRunning ? "Analysis running" : "Dashboard ready"}
                </span>
              </div>

              {isLocked && (
                <div className="auth-lock-panel">
                  <div className="auth-lock-copy">
                    <div className="auth-lock-title">Authentication required</div>
                    <div className="auth-lock-text">
                      Sign in with your email to unlock analysis tools and protected
                      API access.
                    </div>
                  </div>
                  <button type="button" className="auth-primary-btn" onClick={openAuthModal}>
                    Sign in
                  </button>
                </div>
              )}

              {visibleAuthError && <div className="auth-inline-error">{visibleAuthError}</div>}
            </div>
          </div>
        </div>
      )}

      {isSiteLoaded && singlePageWorkflow && (
        <div className="report-shell">
          <section className="card report-hero">
            <div className="card-body report-hero-grid">
              <div className="report-hero-copy">
                <div className="section-kicker">One-Page Workflow</div>
                <div className="report-brand-row">
                  <div className="report-brand-mark">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brand.favicon}
                      alt={brand.title}
                      className="report-brand-mark-image"
                    />
                  </div>
                  <div>
                    <h1 className="report-title">{workspaceTitle}</h1>
                    <p className="report-lead">
                      {brand.description ||
                        "Friday is now organized as a single SaaS operating page for research, messaging, and content execution."}
                    </p>
                  </div>
                </div>
                <div className="report-meta-row">
                  <span className="status-chip status-chip-accent">SaaS workflow</span>
                  <span className="status-chip">
                    {analysis.isRunning ? analysis.stepLabel : "Operating view ready"}
                  </span>
                </div>
              </div>

              <div className="report-metrics">
                <div className="metric-card">
                  <div className="metric-label">Operator</div>
                  <div className="metric-value">
                    {chatMessages.length > 0 ? `${chatMessages.length}` : "Ready"}
                  </div>
                  <div className="metric-note">Marketing console prompts</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Research</div>
                  <div className="metric-value">
                    {analysis.productAnalysis ? "Ready" : analysis.isRunning ? "Running" : "Pending"}
                  </div>
                  <div className="metric-note">Positioning summary</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Voice</div>
                  <div className="metric-value">
                    {brandVoiceDoc ? "Ready" : isBrandVoiceLoading ? "Drafting" : "Pending"}
                  </div>
                  <div className="metric-note">Brand guidance</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Insights</div>
                  <div className="metric-value">{insightCount}</div>
                  <div className="metric-note">Campaign notes</div>
                </div>
              </div>
            </div>
          </section>

          <section className="card report-section">
            <div className="card-header">
              <div className="section-heading">
                <div className="section-kicker">Workflow</div>
                <span>Everything in one operating page</span>
              </div>
            </div>
            <div className="card-body">
              <div className="report-fact-grid" style={{ marginTop: 0 }}>
                {workflowOverview.map((item) => (
                  <div key={item.label} className="fact-card">
                    <span className="fact-label">{item.label}</span>
                    <span className="fact-value">{item.value}</span>
                    <div className="text-xs text-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                      {item.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card report-section">
            <div className="card-header">
              <div className="section-heading">
                <div className="section-kicker">Asset</div>
                <span>Poster graphic and copy handoff</span>
              </div>
            </div>
            <div className="card-body poster-studio-grid">
              <div className="poster-preview-shell">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterPreviewSrc}
                  alt={`${workspaceTitle} poster preview`}
                  className="poster-preview-image"
                />
              </div>

              <div className="poster-studio-sidebar">
                <div className="report-summary-block">
                  <div className="font-semibold text-sm">Poster copy</div>
                  <div className="poster-copy-stack">
                    <div>
                      <div className="poster-copy-label">Headline</div>
                      <div className="poster-copy-value">{posterAsset.headline}</div>
                    </div>
                    <div>
                      <div className="poster-copy-label">Support line</div>
                      <div className="poster-copy-value poster-copy-muted">
                        {posterAsset.subheadline}
                      </div>
                    </div>
                    <div>
                      <div className="poster-copy-label">CTA</div>
                      <div className="poster-copy-value">{posterAsset.cta}</div>
                    </div>
                  </div>

                  <div className="poster-proof-list">
                    {posterAsset.proofPoints.map((point) => (
                      <span key={point} className="analysis-tag">
                        {point}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="poster-action-row">
                  <button
                    type="button"
                    className="secondary-inline-button"
                    onClick={() => void handleCopyAction("poster-text", posterText)}
                  >
                    {copiedKey === "poster-text" ? (
                      <>
                        <Check style={{ width: 14, height: 14 }} />
                        <span>Copied poster text</span>
                      </>
                    ) : (
                      <>
                        <Copy style={{ width: 14, height: 14 }} />
                        <span>Copy poster text</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="primary-inline-button"
                    onClick={handleDownloadPoster}
                  >
                    <Download style={{ width: 14, height: 14 }} />
                    <span>Download SVG</span>
                  </button>
                </div>

                <div className="poster-footnote">
                  The poster downloads as an SVG so it can be reused directly or opened in
                  Illustrator before posting to Instagram or X.
                </div>

                <div className="report-summary-block">
                  <div className="poster-copy-header">
                    <div className="font-semibold text-sm">Latest ad copy</div>
                    {latestAssistantMessage && (
                      <button
                        type="button"
                        className="secondary-inline-button"
                        onClick={() =>
                          void handleCopyAction("latest-ad", latestAssistantMessage.content)
                        }
                      >
                        {copiedKey === "latest-ad" ? (
                          <>
                            <Check style={{ width: 14, height: 14 }} />
                            <span>Copied ad</span>
                          </>
                        ) : (
                          <>
                            <Copy style={{ width: 14, height: 14 }} />
                            <span>Copy ad</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {latestAssistantMessage ? (
                    <div className="poster-copy-preview">{latestAssistantMessage.content}</div>
                  ) : (
                    <div className="poster-copy-preview poster-copy-placeholder">
                      Run a prompt below to generate the caption, ad copy, or platform
                      variants that go with this poster.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="card report-section">
            <div className="card-header">
              <div className="section-heading">
                <div className="section-kicker">Brand Ads</div>
                <span>AI-generated branded images</span>
              </div>
            </div>
            <div className="card-body">
              <div className="report-summary-block">
                <div className="font-semibold text-sm">
                  Generate branded ad images for social media
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                  Friday scrapes your website for brand colors, fonts, and imagery,
                  then generates platform-ready ad creatives using AI.
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                  Ad format
                </div>
                <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
                  {AD_FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`landing-example-chip${
                        selectedAdFormat === opt.value ? " landing-example-chip-active" : ""
                      }`}
                      onClick={() => setSelectedAdFormat(opt.value)}
                      disabled={isGeneratingAd}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                  Custom direction (optional)
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void generateBrandAd();
                  }}
                  style={{ display: "flex", gap: 8, alignItems: "stretch" }}
                >
                  <input
                    type="text"
                    className="report-input"
                    placeholder="e.g. focus on product launch, use dark theme, highlight pricing..."
                    value={adPrompt}
                    onChange={(event) => setAdPrompt(event.target.value)}
                    disabled={isGeneratingAd}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="primary-inline-button"
                    disabled={isGeneratingAd || !currentSiteUrl}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {isGeneratingAd ? (
                      <>
                        <Loader2 className="spin" style={{ width: 14, height: 14 }} />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Image style={{ width: 14, height: 14 }} />
                        <span>Generate Ad</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {adError && (
                <div className="report-error" style={{ marginTop: 14 }}>
                  {adError}
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => void generateBrandAd()}
                      className="secondary-inline-button"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {generatedAds.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 12 }}>
                    Generated ads ({generatedAds.length})
                  </div>
                  <div className="brand-ads-grid">
                    {generatedAds.map((ad, index) => {
                      const imgSrc = `data:${ad.mimeType};base64,${ad.imageBase64}`;
                      const formatLabel =
                        AD_FORMAT_OPTIONS.find((o) => o.value === ad.format)?.label ?? ad.format;
                      return (
                        <div key={`${ad.format}-${index}`} className="brand-ad-card">
                          <div className="brand-ad-preview">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imgSrc}
                              alt={`${formatLabel} ad`}
                              className="brand-ad-image"
                            />
                          </div>
                          <div className="brand-ad-meta">
                            <span className="status-chip status-chip-accent">{formatLabel}</span>
                            {ad.brandAssets?.colors && ad.brandAssets.colors.length > 0 && (
                              <div className="brand-ad-colors">
                                {ad.brandAssets.colors.slice(0, 5).map((color) => (
                                  <span
                                    key={color}
                                    className="brand-ad-color-dot"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="brand-ad-actions">
                            <button
                              type="button"
                              className="secondary-inline-button"
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = imgSrc;
                                link.download = `${workspaceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ad.format}.png`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                            >
                              <Download style={{ width: 14, height: 14 }} />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {generatedAds.length === 0 && !adError && !isGeneratingAd && (
                <div
                  className="report-empty"
                  style={{ marginTop: 18, textAlign: "center" }}
                >
                  <Image style={{ width: 24, height: 24, opacity: 0.4, margin: "0 auto 8px" }} />
                  <div>No ads generated yet. Pick a format and hit Generate.</div>
                </div>
              )}
            </div>
          </section>

          <section className="card report-section">
            <div className="card-header">
              <div className="section-heading">
                <div className="section-kicker">Operator</div>
                <span>Marketing console</span>
              </div>
            </div>
            <div className="card-body">
              <div className="report-summary-block">
                <div className="font-semibold text-sm">
                  Create the ad copy that ships with the poster
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                  Ask Friday to write captions, launch copy, platform variants, or angle
                  explorations without leaving the research workspace.
                </div>
                <div className="flex" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <span className="status-chip status-chip-accent">Poster workflow</span>
                  <span className="status-chip">
                    {analysis.productAnalysis ? "Research attached" : "Basic brand context"}
                  </span>
                  <span className="status-chip">
                    {brandVoiceDoc ? "Voice guide attached" : "Voice guide optional"}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                  Quick prompts
                </div>
                <div className="landing-example-list">
                  {marketingPromptSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="landing-example-chip"
                      disabled={isChatLoading}
                      onClick={() => handleChatSubmit(undefined, prompt)}
                    >
                      {truncateText(prompt, 72)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              ref={chatMessagesRef}
              className="chat-messages"
              style={{
                borderTop: "1px solid var(--border)",
                minHeight: 320,
                maxHeight: 620,
              }}
            >
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  <div className="text-sm font-semibold">No content requests yet</div>
                  <div
                    className="text-sm text-muted"
                    style={{ marginTop: 8, maxWidth: 520, textAlign: "center", lineHeight: 1.7 }}
                  >
                    Start with a poster caption, an Instagram variant, or an X post.
                    Friday will use the loaded research and return copy that matches
                    the graphic above.
                  </div>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-msg${
                      message.role === "user" ? " chat-msg-user" : ""
                    }`}
                  >
                    <div
                      className={`chat-msg-avatar ${
                        message.role === "user"
                          ? "user-msg-avatar"
                          : "assistant-msg-avatar"
                      }`}
                    >
                      {message.role === "user" ? "U" : "FR"}
                    </div>
                    <div className="chat-msg-content">
                      {message.role === "assistant" && message.content.trim() && (
                        <div className="chat-msg-actions">
                          <button
                            type="button"
                            className="secondary-inline-button chat-msg-action"
                            onClick={() => void handleCopyAction(`message-${message.id}`, message.content)}
                          >
                            {copiedKey === `message-${message.id}` ? (
                              <>
                                <Check style={{ width: 14, height: 14 }} />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy style={{ width: 14, height: 14 }} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      <div className="chat-msg-text">{message.content}</div>
                    </div>
                  </div>
                ))
              )}

              {isChatLoading && (
                <div className="chat-msg">
                  <div className="chat-msg-avatar assistant-msg-avatar">FR</div>
                  <div className="chat-msg-content">
                    <div className="chat-typing text-sm text-muted">
                      <Loader2 className="spin" style={{ width: 14, height: 14 }} />
                      Drafting poster ad copy...
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form className="chat-input-wrapper" onSubmit={handleChatSubmit}>
              <input
                type="text"
                className="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask for a caption, an X post, or the copy that matches the poster..."
                disabled={isChatLoading}
              />
              <button
                type="submit"
                className="chat-submit"
                disabled={isChatLoading || !chatInput.trim()}
                aria-label="Send prompt"
              >
                <ChevronRight style={{ width: 18, height: 18 }} />
              </button>
            </form>
          </section>

          <div className="report-preview-grid">
            <section className="card report-section">
              <div className="card-header">
                <div className="section-heading">
                  <div className="section-kicker">Product</div>
                  <span>Positioning and audience</span>
                </div>
              </div>
              <div className="card-body">
                {!analysis.productAnalysis && (
                  <div className="report-empty">
                    {analysis.isRunning
                      ? "Friday is still reading the product and extracting the positioning."
                      : "No product analysis available yet. Load a site to generate it."}
                  </div>
                )}

                {analysis.productAnalysis && (
                  <>
                    <div className="report-summary-block">
                      <div className="font-semibold text-sm">
                        {analysis.productAnalysis.brandName}
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                        {analysis.productAnalysis.oneLiner}
                      </div>
                      <div
                        className="text-sm"
                        style={{ marginTop: 10, color: "var(--ink)", lineHeight: 1.7 }}
                      >
                        {analysis.productAnalysis.positioning}
                      </div>
                    </div>

                    {analysis.productAnalysis.targetAudience.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                          Target Audience
                        </div>
                        <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
                          {analysis.productAnalysis.targetAudience.map((audience) => (
                            <span key={audience} className="analysis-tag">{audience}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {analysis.productAnalysis.painPoints.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                          Pain Points Addressed
                        </div>
                        {analysis.productAnalysis.painPoints.map((painPoint) => (
                          <div key={painPoint} className="analysis-list-item">{painPoint}</div>
                        ))}
                      </div>
                    )}

                    {analysis.productAnalysis.differentiators.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                          Differentiators
                        </div>
                        {analysis.productAnalysis.differentiators.map((differentiator) => (
                          <div key={differentiator} className="analysis-list-item">
                            {differentiator}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            <section className="card report-section">
              <div className="card-header">
                <div className="section-heading">
                  <div className="section-kicker">Landscape</div>
                  <span>Competitors and comparisons</span>
                </div>
                {competitorError && (
                  <button
                    type="button"
                    onClick={retryCompetitorDiscovery}
                    className="secondary-inline-button"
                  >
                    Retry
                  </button>
                )}
              </div>
              <div className="card-body">
                {isDiscoveringCompetitors && competitors.length === 0 && (
                  <div className="flex items-center gap-2 text-muted text-sm" style={{ marginBottom: 10 }}>
                    <Loader2 className="spin" style={{ width: 14, height: 14 }} />
                    Fetching live competitor data...
                  </div>
                )}

                {competitorError && <div className="report-error">{competitorError}</div>}

                {!isDiscoveringCompetitors && competitors.length === 0 && !competitorError && (
                  <div className="report-empty">
                    No competitors loaded yet. Add a domain manually or let Friday
                    discover them from the current site.
                  </div>
                )}

                {competitors.length > 0 && (
                  <div className="competitor-list">
                    {competitors.map((competitor) => (
                      <div key={competitor.domain} className="competitor-item">
                        <div className="competitor-item-button">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={competitor.logo || getCompetitorLogo(competitor.domain)}
                            alt={competitor.name}
                            style={{ width: 18, height: 18, borderRadius: 4 }}
                          />
                          <div className="competitor-copy">
                            <div className="competitor-copy-header">
                              <span className="competitor-name">{competitor.name}</span>
                              <span className="competitor-domain">{competitor.domain}</span>
                            </div>
                            <div className="competitor-reason">{competitor.reason}</div>
                            {competitor.positioning && (
                              <div className="competitor-positioning">
                                {competitor.positioning}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="competitor-remove-btn"
                          aria-label={`Remove ${competitor.domain}`}
                          onClick={() => removeCompetitor(competitor.domain)}
                        >
                          <X style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addCompetitor(competitorInput);
                    setCompetitorInput("");
                  }}
                  style={{ marginTop: 14 }}
                >
                  <input
                    type="text"
                    placeholder="Add competitor domain or URL..."
                    value={competitorInput}
                    onChange={(event) => setCompetitorInput(event.target.value)}
                    className="report-input"
                  />
                </form>

                {analysis.competitorAnalyses.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                      Detailed competitor reads
                    </div>
                    {analysis.competitorAnalyses.map((competitorAnalysis) => (
                      <div key={competitorAnalysis.domain} className="report-subcard">
                        <div className="report-subcard-header">
                          <div>
                            <div className="font-semibold text-sm">{competitorAnalysis.name}</div>
                            <div className="text-xs text-muted">{competitorAnalysis.domain}</div>
                          </div>
                        </div>
                        <div className="text-sm" style={{ lineHeight: 1.7 }}>
                          {competitorAnalysis.positioning}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="report-preview-grid">
            <section className="card report-section">
              <div className="card-header">
                <div className="section-heading">
                  <div className="section-kicker">Messaging</div>
                  <span>Brand voice</span>
                </div>
              </div>
              <div className="card-body">
                {!brandVoiceDoc && !isBrandVoiceLoading && !brandVoiceError && (
                  <div className="report-empty">
                    <div style={{ marginBottom: 14 }}>
                      Generate a brand voice document based on the website content.
                    </div>
                    <button
                      type="button"
                      onClick={generateBrandVoice}
                      className="primary-inline-button"
                    >
                      Generate Brand Voice
                    </button>
                  </div>
                )}

                {isBrandVoiceLoading && (
                  <div className="flex items-center gap-2 text-muted text-sm">
                    <Loader2 className="spin" style={{ width: 16, height: 16 }} />
                    Generating brand voice...
                  </div>
                )}

                {brandVoiceError && (
                  <div className="report-error">
                    {brandVoiceError}
                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={generateBrandVoice}
                        className="secondary-inline-button"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {brandVoiceDoc && (
                  <>
                    <div className="report-quote-block">
                      &ldquo;{brandVoiceDoc.identity}&rdquo;
                    </div>

                    <div style={{ marginTop: 18 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 8, fontWeight: 700 }}>
                        Voice Principles
                      </div>
                      {brandVoiceDoc.principles.map((principle) => (
                        <div key={principle.label} className="report-subcard">
                          <div className="text-sm font-semibold">{principle.label}</div>
                          <div className="text-sm text-muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
                            {principle.explanation}
                          </div>
                          <div className="report-example-block">{principle.example}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="card report-section">
              <div className="card-header">
                <div className="section-heading">
                  <div className="section-kicker">Strategy</div>
                  <span>Campaign angles and next moves</span>
                </div>
              </div>
              <div className="card-body">
                {!analysis.insights && (
                  <div className="report-empty">
                    {analysis.isRunning
                      ? "Friday is still pulling together the strategic takeaways."
                      : "No strategic insights yet. They will appear here after the analysis finishes."}
                  </div>
                )}

                {analysis.insights && (
                  <>
                    {analysis.insights.opportunities.length > 0 && (
                      <div>
                        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                          Opportunities
                        </div>
                        {analysis.insights.opportunities.map((opportunity) => (
                          <div key={opportunity} className="analysis-list-item">{opportunity}</div>
                        ))}
                      </div>
                    )}

                    {analysis.insights.gaps.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                          Competitive Gaps
                        </div>
                        {analysis.insights.gaps.map((gap) => (
                          <div key={gap} className="analysis-list-item">{gap}</div>
                        ))}
                      </div>
                    )}

                    {analysis.insights.recommendations.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                          Recommendations
                        </div>
                        {analysis.insights.recommendations.map((recommendation) => (
                          <div key={recommendation} className="analysis-list-item">
                            {recommendation}
                          </div>
                        ))}
                      </div>
                    )}

                    {analysis.insights.positioningAdvice && (
                      <div className="report-quote-block" style={{ marginTop: 18 }}>
                        {analysis.insights.positioningAdvice}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "home" && (
        <div className="report-shell report-shell-home">
          <section className="card report-hero">
            <div className="card-body report-hero-grid">
              <div className="report-hero-copy">
                <div className="section-kicker">Homepage Summary</div>
                <div className="report-brand-row">
                  <div className="report-brand-mark">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brand.favicon}
                      alt={brand.title}
                      style={{ width: 22, height: 22 }}
                    />
                  </div>
                  <div>
                    <h1 className="report-title">{brand.title}</h1>
                    <p className="report-lead">
                      {brand.description ||
                        "Friday is organizing the brand research and publishing workflow into dedicated pages."}
                    </p>
                  </div>
                </div>
                <div className="report-meta-row">
                  <span className="status-chip status-chip-accent">{currentDomain}</span>
                  <span className="status-chip">
                    {analysis.isRunning ? analysis.stepLabel : "Overview ready"}
                  </span>
                </div>
              </div>

              <div className="report-metrics">
                <div className="metric-card">
                  <div className="metric-label">Competitors</div>
                  <div className="metric-value">{competitors.length}</div>
                  <div className="metric-note">Tracked brands</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Product</div>
                  <div className="metric-value">
                    {analysis.productAnalysis ? "Ready" : analysis.isRunning ? "Running" : "Pending"}
                  </div>
                  <div className="metric-note">Positioning summary</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Brand Voice</div>
                  <div className="metric-value">
                    {brandVoiceDoc ? "Ready" : isBrandVoiceLoading ? "Drafting" : "Pending"}
                  </div>
                  <div className="metric-note">Voice guide status</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Insights</div>
                  <div className="metric-value">{insightCount}</div>
                  <div className="metric-note">Strategy notes</div>
                </div>
              </div>
            </div>
          </section>

          <div className="report-home-layout">
            <div className="report-main">
              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Overview</div>
                    <span>Company snapshot</span>
                  </div>
                </div>
                <div className="card-body">
                  <div className="report-fact-grid">
                    <div className="fact-card">
                      <span className="fact-label">Website</span>
                      <a
                        href={currentSiteUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="fact-value"
                      >
                        {currentSiteUrl}
                      </a>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Status</span>
                      <span className="fact-value">
                        {analysis.isRunning ? "Analysis in progress" : "Ready to review"}
                      </span>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Competitor coverage</span>
                      <span className="fact-value">
                        {competitors.length > 0
                          ? `${competitors.length} brands discovered`
                          : "No competitors loaded yet"}
                      </span>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Brand voice</span>
                      <span className="fact-value">
                        {brandVoiceDoc ? "Generated and attached" : "Not generated yet"}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="report-preview-grid">
                <button
                  type="button"
                  className="card report-preview-card"
                  onClick={() => setCurrentView("marketing-console")}
                >
                  <div className="card-header">
                    <div className="section-heading">
                      <div className="section-kicker">Operator</div>
                      <span>Marketing console</span>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: "var(--muted)" }} />
                  </div>
                  <div className="card-body">
                    <p className="report-copy">
                      {chatMessages.length > 0
                        ? truncateText(
                            chatMessages[chatMessages.length - 1]?.content ||
                              "Open the console to continue the current content workflow.",
                            160,
                          ) ||
                          "Open the console to continue the current content workflow."
                        : "Generate the poster copy, social captions, and campaign angles from the current brand context."}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  className="card report-preview-card"
                  onClick={() => setCurrentView("product-information")}
                >
                  <div className="card-header">
                    <div className="section-heading">
                      <div className="section-kicker">Product</div>
                      <span>Product information</span>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: "var(--muted)" }} />
                  </div>
                  <div className="card-body">
                    <p className="report-copy">
                      {analysis.productAnalysis?.positioning ||
                        "Open the product page to review positioning, audience, differentiators, and voice signals."}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  className="card report-preview-card"
                  onClick={() => setCurrentView("competitor-analysis")}
                >
                  <div className="card-header">
                    <div className="section-heading">
                      <div className="section-kicker">Landscape</div>
                      <span>Competitor analysis</span>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: "var(--muted)" }} />
                  </div>
                  <div className="card-body">
                    {competitors.length > 0 ? (
                      <div className="report-preview-stack">
                        {competitors.slice(0, 3).map((competitor) => (
                          <div key={competitor.domain} className="report-preview-row">
                            <span className="font-semibold text-sm">{competitor.name}</span>
                            <span className="text-xs text-muted">{competitor.domain}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="report-copy">
                        Open the competitor page to review the discovered brands and full analysis.
                      </p>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  className="card report-preview-card"
                  onClick={() => setCurrentView("brand-voice")}
                >
                  <div className="card-header">
                    <div className="section-heading">
                      <div className="section-kicker">Messaging</div>
                      <span>Brand voice</span>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: "var(--muted)" }} />
                  </div>
                  <div className="card-body">
                    <p className="report-copy">
                      {brandVoiceDoc?.identity ||
                        "Generate and review the full voice guide on its own page so the homepage stays uncluttered."}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  className="card report-preview-card"
                  onClick={() => setCurrentView("strategic-insights")}
                >
                  <div className="card-header">
                    <div className="section-heading">
                      <div className="section-kicker">Strategy</div>
                      <span>Strategic insights</span>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: "var(--muted)" }} />
                  </div>
                  <div className="card-body">
                    {analysis.insights ? (
                      <div className="report-preview-stack">
                        {analysis.insights.opportunities.slice(0, 2).map((item) => (
                          <div key={item} className="analysis-list-item">{item}</div>
                        ))}
                      </div>
                    ) : (
                      <p className="report-copy">
                        Open the strategic insights page to review opportunities, gaps, and recommendations.
                      </p>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "company-report" && (
        <div className="report-shell">
          <div className="detail-page-layout">
            <div className="report-main">
              <button
                type="button"
                className="back-button"
                onClick={() => setCurrentView("home")}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to home</span>
              </button>

              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Overview</div>
                    <span>Company report</span>
                  </div>
                </div>
                <div className="card-body">
                  <p className="report-copy">
                    This page holds the company-level summary so the home screen stays
                    concise. Use it for the top-level website context, report status,
                    and operational summary.
                  </p>

                  <div className="report-fact-grid" style={{ marginTop: 18 }}>
                    <div className="fact-card">
                      <span className="fact-label">Website</span>
                      <a
                        href={currentSiteUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="fact-value"
                      >
                        {currentSiteUrl}
                      </a>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Domain</span>
                      <span className="fact-value">{currentDomain}</span>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Current status</span>
                      <span className="fact-value">
                        {analysis.isRunning ? "Analysis in progress" : "Ready to review"}
                      </span>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Competitor coverage</span>
                      <span className="fact-value">
                        {competitors.length > 0
                          ? `${competitors.length} brands discovered`
                          : "No competitors loaded yet"}
                      </span>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Product view</span>
                      <span className="fact-value">
                        {analysis.productAnalysis ? "Generated" : "Pending"}
                      </span>
                    </div>
                    <div className="fact-card">
                      <span className="fact-label">Brand voice</span>
                      <span className="fact-value">
                        {brandVoiceDoc ? "Generated and attached" : "Not generated yet"}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "marketing-console" && (
        <div className="report-shell">
          <div className="detail-page-layout">
            <div className="report-main">
              <button
                type="button"
                className="back-button"
                onClick={() => setCurrentView("home")}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to home</span>
              </button>

              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Operator</div>
                    <span>Marketing console</span>
                  </div>
                </div>
                <div className="card-body">
                  <div className="report-summary-block">
                    <div className="font-semibold text-sm">
                      Research-driven content execution for {brand.title}
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                      Ask Friday to draft poster copy, captions, messaging angles, or
                      campaign variants. Live publishing is not connected in this build.
                    </div>
                    <div className="flex" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <span className="status-chip status-chip-accent">Poster workflow</span>
                      <span className="status-chip">
                        {analysis.productAnalysis ? "Brand context loaded" : "Basic brand context"}
                      </span>
                      <span className="status-chip">
                        {brandVoiceDoc ? "Voice guide attached" : "Voice guide optional"}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                      Quick prompts
                    </div>
                    <div className="landing-example-list">
                      {marketingPromptSuggestions.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="landing-example-chip"
                          disabled={isChatLoading}
                          onClick={() => handleChatSubmit(undefined, prompt)}
                        >
                          {truncateText(prompt, 72)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  ref={chatMessagesRef}
                  className="chat-messages"
                  style={{
                    borderTop: "1px solid var(--border)",
                    minHeight: 320,
                    maxHeight: 620,
                  }}
                >
                  {chatMessages.length === 0 ? (
                    <div className="chat-empty">
                      <div className="text-sm font-semibold">No content requests yet</div>
                      <div
                        className="text-sm text-muted"
                        style={{ marginTop: 8, maxWidth: 520, textAlign: "center", lineHeight: 1.7 }}
                      >
                        Start with a poster caption, an Instagram variant, or an X post.
                        Friday will use the loaded research and return a clean draft
                        package.
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-msg${
                          message.role === "user" ? " chat-msg-user" : ""
                        }`}
                      >
                        <div
                          className={`chat-msg-avatar ${
                            message.role === "user"
                              ? "user-msg-avatar"
                              : "assistant-msg-avatar"
                          }`}
                        >
                          {message.role === "user" ? "U" : "FR"}
                        </div>
                        <div className="chat-msg-content">
                          <div className="chat-msg-text">{message.content}</div>
                        </div>
                      </div>
                    ))
                  )}

                  {isChatLoading && (
                    <div className="chat-msg">
                      <div className="chat-msg-avatar assistant-msg-avatar">FR</div>
                      <div className="chat-msg-content">
                        <div className="chat-typing text-sm text-muted">
                          <Loader2 className="spin" style={{ width: 14, height: 14 }} />
                          Drafting poster ad copy...
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <form className="chat-input-wrapper" onSubmit={handleChatSubmit}>
                  <input
                    type="text"
                    className="chat-input"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Ask for a caption, an X post, or the copy that matches the poster..."
                    disabled={isChatLoading}
                  />
                  <button
                    type="submit"
                    className="chat-submit"
                    disabled={isChatLoading || !chatInput.trim()}
                    aria-label="Send prompt"
                  >
                    <ChevronRight style={{ width: 18, height: 18 }} />
                  </button>
                </form>
              </section>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "product-information" && (
        <div className="report-shell">
          <div className="detail-page-layout">
            <div className="report-main">
              <button
                type="button"
                className="back-button"
                onClick={() => setCurrentView("home")}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to home</span>
              </button>

              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Product</div>
                    <span>Product information</span>
                  </div>
                </div>
                <div className="card-body">
                  {!analysis.productAnalysis && (
                    <div className="report-empty">
                      {analysis.isRunning
                        ? "Friday is still reading the product and extracting the positioning."
                        : "No product analysis available yet. Load a site to generate it."}
                    </div>
                  )}

                  {analysis.productAnalysis && (
                    <>
                      <div className="report-summary-block">
                        <div className="font-semibold text-sm">
                          {analysis.productAnalysis.brandName}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                          {analysis.productAnalysis.oneLiner}
                        </div>
                        <div
                          className="text-sm"
                          style={{ marginTop: 10, color: "var(--ink)", lineHeight: 1.7 }}
                        >
                          {analysis.productAnalysis.positioning}
                        </div>
                      </div>

                      {analysis.productAnalysis.targetAudience.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Target Audience
                          </div>
                          <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
                            {analysis.productAnalysis.targetAudience.map((a) => (
                              <span key={a} className="analysis-tag">{a}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.productAnalysis.painPoints.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Pain Points Addressed
                          </div>
                          {analysis.productAnalysis.painPoints.map((p) => (
                            <div key={p} className="analysis-list-item">{p}</div>
                          ))}
                        </div>
                      )}

                      {analysis.productAnalysis.differentiators.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Differentiators
                          </div>
                          {analysis.productAnalysis.differentiators.map((d) => (
                            <div key={d} className="analysis-list-item">{d}</div>
                          ))}
                        </div>
                      )}

                      {analysis.productAnalysis.brandVoice.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Brand Voice Signals
                          </div>
                          <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
                            {analysis.productAnalysis.brandVoice.map((v) => (
                              <span key={v} className="analysis-tag">{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "competitor-analysis" && (
        <div className="report-shell">
          <div className="detail-page-layout">
            <div className="report-main">
              <button
                type="button"
                className="back-button"
                onClick={() => setCurrentView("home")}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to home</span>
              </button>

              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Landscape</div>
                    <span>Competitor analysis</span>
                  </div>
                  {competitorError && (
                    <button
                      type="button"
                      onClick={retryCompetitorDiscovery}
                      className="secondary-inline-button"
                    >
                      Retry
                    </button>
                  )}
                </div>
                <div className="card-body">
                  {isDiscoveringCompetitors && competitors.length === 0 && (
                    <div className="flex items-center gap-2 text-muted text-sm" style={{ marginBottom: 10 }}>
                      <Loader2 className="spin" style={{ width: 14, height: 14 }} />
                      Fetching live competitor data...
                    </div>
                  )}

                  {competitorError && (
                    <div className="report-error">{competitorError}</div>
                  )}

                  {!isDiscoveringCompetitors && competitors.length === 0 && !competitorError && (
                    <div className="report-empty">
                      No competitors loaded yet. Add a domain manually or let Friday
                      discover them from the current site.
                    </div>
                  )}

                  {competitors.length > 0 && (
                    <div className="competitor-list">
                      {competitors.map((competitor) => (
                        <div key={competitor.domain} className="competitor-item">
                          <div className="competitor-item-button">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={competitor.logo || getCompetitorLogo(competitor.domain)}
                              alt={competitor.name}
                              style={{ width: 18, height: 18, borderRadius: 4 }}
                            />
                            <div className="competitor-copy">
                              <div className="competitor-copy-header">
                                <span className="competitor-name">{competitor.name}</span>
                                <span className="competitor-domain">{competitor.domain}</span>
                              </div>
                              <div className="competitor-reason">{competitor.reason}</div>
                              {competitor.positioning && (
                                <div className="competitor-positioning">
                                  {competitor.positioning}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="competitor-remove-btn"
                            aria-label={`Remove ${competitor.domain}`}
                            onClick={() => removeCompetitor(competitor.domain)}
                          >
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      addCompetitor(competitorInput);
                      setCompetitorInput("");
                    }}
                    style={{ marginTop: 14 }}
                  >
                    <input
                      type="text"
                      placeholder="Add competitor domain or URL..."
                      value={competitorInput}
                      onChange={(event) => setCompetitorInput(event.target.value)}
                      className="report-input"
                    />
                  </form>

                  {analysis.competitorAnalyses.length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                        Detailed competitor reads
                      </div>
                      {analysis.competitorAnalyses.map((ca) => (
                        <div key={ca.domain} className="report-subcard">
                          <div className="report-subcard-header">
                            <div>
                              <div className="font-semibold text-sm">{ca.name}</div>
                              <div className="text-xs text-muted">{ca.domain}</div>
                            </div>
                          </div>
                          <div className="text-sm" style={{ lineHeight: 1.7 }}>
                            {ca.positioning}
                          </div>

                          {ca.strengths.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                                Strengths
                              </div>
                              <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
                                {ca.strengths.map((s) => (
                                  <span key={s} className="analysis-tag strength-tag">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {ca.weaknesses.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                                Weaknesses
                              </div>
                              <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
                                {ca.weaknesses.map((w) => (
                                  <span key={w} className="analysis-tag weakness-tag">{w}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {ca.contentStrategy && (
                            <div style={{ marginTop: 14 }}>
                              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                                Content Strategy
                              </div>
                              <div className="text-sm" style={{ lineHeight: 1.7 }}>
                                <strong>Tone:</strong> {ca.contentStrategy.tone}
                                {ca.contentStrategy.cadence && (
                                  <> · <strong>Cadence:</strong> {ca.contentStrategy.cadence}</>
                                )}
                              </div>
                              {ca.contentStrategy.channels.length > 0 && (
                                <div className="flex" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                  {ca.contentStrategy.channels.map((ch) => (
                                    <span key={ch} className="analysis-tag">{ch}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {ca.pricingModel && (
                            <div style={{ marginTop: 14 }}>
                              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                                Pricing
                              </div>
                              <div className="text-sm">{ca.pricingModel}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "brand-voice" && (
        <div className="report-shell">
          <div className="detail-page-layout">
            <div className="report-main">
              <button
                type="button"
                className="back-button"
                onClick={() => setCurrentView("home")}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to home</span>
              </button>

              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Messaging</div>
                    <span>Brand voice</span>
                  </div>
                </div>
                <div className="card-body">
                  {!brandVoiceDoc && !isBrandVoiceLoading && !brandVoiceError && (
                    <div className="report-empty">
                      <div style={{ marginBottom: 14 }}>
                        Generate a brand voice document based on the website content.
                      </div>
                      <button
                        type="button"
                        onClick={generateBrandVoice}
                        className="primary-inline-button"
                      >
                        Generate Brand Voice
                      </button>
                    </div>
                  )}

                  {isBrandVoiceLoading && (
                    <div className="flex items-center gap-2 text-muted text-sm">
                      <Loader2 className="spin" style={{ width: 16, height: 16 }} />
                      Generating brand voice...
                    </div>
                  )}

                  {brandVoiceError && (
                    <div className="report-error">
                      {brandVoiceError}
                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          onClick={generateBrandVoice}
                          className="secondary-inline-button"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  )}

                  {brandVoiceDoc && (
                    <>
                      <div className="report-quote-block">
                        &ldquo;{brandVoiceDoc.identity}&rdquo;
                      </div>

                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8, fontWeight: 700 }}>
                          Voice Principles
                        </div>
                        {brandVoiceDoc.principles.map((p) => (
                          <div key={p.label} className="report-subcard">
                            <div className="text-sm font-semibold">{p.label}</div>
                            <div className="text-sm text-muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
                              {p.explanation}
                            </div>
                            <div className="report-example-block">{p.example}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8, fontWeight: 700 }}>
                          Tone Spectrum
                        </div>
                        {brandVoiceDoc.toneSpectrum.map((t) => (
                          <div key={t.context} className="report-subcard">
                            <div className="text-sm">
                              <span className="font-semibold">{t.context}</span>
                              <span className="text-muted" style={{ marginLeft: 6 }}>
                                {t.tone}
                              </span>
                            </div>
                            <div className="report-example-block">{t.example}</div>
                          </div>
                        ))}
                      </div>

                      <div className="report-dual-list">
                        <div className="report-list-column">
                          <div className="report-list-title report-list-title-do">Do</div>
                          {brandVoiceDoc.dos.map((d) => (
                            <div key={d} className="report-rule report-rule-do">{d}</div>
                          ))}
                        </div>
                        <div className="report-list-column">
                          <div className="report-list-title report-list-title-dont">Don&apos;t</div>
                          {brandVoiceDoc.donts.map((d) => (
                            <div key={d} className="report-rule report-rule-dont">{d}</div>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: 18 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 8, fontWeight: 700 }}>
                          Voice in Action
                        </div>
                        {brandVoiceDoc.rewrites.map((r) => (
                          <div key={r.generic} className="report-subcard">
                            <div className="report-strike-copy">{r.generic}</div>
                            <div className="report-rewrite-copy">{r.rewritten}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      {isSiteLoaded && !singlePageWorkflow && currentView === "strategic-insights" && (
        <div className="report-shell">
          <div className="detail-page-layout">
            <div className="report-main">
              <button
                type="button"
                className="back-button"
                onClick={() => setCurrentView("home")}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to home</span>
              </button>

              <section className="card report-section">
                <div className="card-header">
                  <div className="section-heading">
                    <div className="section-kicker">Strategy</div>
                    <span>Strategic insights</span>
                  </div>
                </div>
                <div className="card-body">
                  {!analysis.insights && (
                    <div className="report-empty">
                      {analysis.isRunning
                        ? "Friday is still pulling together the strategic takeaways."
                        : "No strategic insights yet. They will appear here after the analysis finishes."}
                    </div>
                  )}

                  {analysis.insights && (
                    <>
                      {analysis.insights.opportunities.length > 0 && (
                        <div>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Opportunities
                          </div>
                          {analysis.insights.opportunities.map((o) => (
                            <div key={o} className="analysis-list-item">{o}</div>
                          ))}
                        </div>
                      )}

                      {analysis.insights.gaps.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Competitive Gaps
                          </div>
                          {analysis.insights.gaps.map((g) => (
                            <div key={g} className="analysis-list-item">{g}</div>
                          ))}
                        </div>
                      )}

                      {analysis.insights.recommendations.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                            Recommendations
                          </div>
                          {analysis.insights.recommendations.map((r) => (
                            <div key={r} className="analysis-list-item">{r}</div>
                          ))}
                        </div>
                      )}

                      {analysis.insights.positioningAdvice && (
                        <div className="report-quote-block" style={{ marginTop: 18 }}>
                          {analysis.insights.positioningAdvice}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>

            {renderSidebar()}
          </div>
        </div>
      )}

      <AuthModal
        email={authEmail}
        error={visibleAuthError}
        isGoogleLoading={isGoogleLoading}
        isOpen={isAuthModalOpen}
        isSendingLink={isSendingLink}
        linkSentTo={linkSentTo}
        onClose={closeAuthModal}
        onEmailChange={setAuthEmail}
        onGoogleSignIn={handleGoogleSignIn}
        onSubmit={handleSendMagicLink}
      />
    </div>
  );
}
