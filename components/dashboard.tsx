"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  CheckCircle,
  Chrome,
  ChevronRight,
  FileText,
  Loader2,
  LogOut,
  Mail,
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
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

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
    "Default publishing workflow uses OpenClock.",
    "Primary social channel is LinkedIn unless the operator asks for another platform.",
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
      "Turn research into publish-ready social content and OpenClock upload handoff.",
    competitors: competitors.map((competitor) => competitor.domain),
    brandTheme: "Marketing operator",
    preferredChannels: ["LinkedIn", "X"],
    publishingTool: "OpenClock",
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

  return { ...state, startAnalysis, stopAnalysis };
}

/* ------------------------------------------------------------------ */

export type DashboardProps = {
  authEnabled: boolean;
};

const DEFAULT_TERMINAL_SESSION_NAME = "Friday";

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
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
        <div className="user-avatar text-xs">FR</div>
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
        <div className="user-avatar text-xs">IN</div>
        <div className="auth-pill-copy">
          <span>Sign in</span>
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

export function Dashboard({ authEnabled }: DashboardProps) {
  const [terminalInput, setTerminalInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [currentSiteUrl, setCurrentSiteUrl] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoadingState, setAuthLoadingState] = useState(authEnabled);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [competitors, setCompetitors] = useState<CompetitorRecord[]>([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [isDiscoveringCompetitors, setIsDiscoveringCompetitors] = useState(false);
  const [brandVoiceDoc, setBrandVoiceDoc] = useState<BrandVoiceDoc | null>(null);
  const [isBrandVoiceLoading, setIsBrandVoiceLoading] = useState(false);
  const [brandVoiceError, setBrandVoiceError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const isSiteLoaded = Boolean(currentSiteUrl);
  const brand = useBrandMeta(currentSiteUrl);
  const attemptedDiscoveryRef = useRef(false);

  const analysis = useAnalysisPipeline({
    accessToken: session?.access_token,
    authRequired: authEnabled,
  });

  const currentDomain = currentSiteUrl ? getSiteDomain(currentSiteUrl) : "";
  const workspaceDomain = currentDomain.replace(/^www\./, "");
  const workspaceTitle =
    brand.title && brand.title !== "Website" ? brand.title : workspaceDomain || "Workspace";
  const insightCount = analysis.insights
    ? analysis.insights.opportunities.length +
      analysis.insights.gaps.length +
      analysis.insights.recommendations.length
    : 0;
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
  const landingSections = [
    {
      label: "Marketing Console",
      note: "Research-backed social posts and OpenClock handoff",
      tag: "Primary",
    },
    {
      label: "Company Report",
      note: "Overview, domain, and workspace status",
      tag: "Overview",
    },
    {
      label: "Product Information",
      note: "Positioning, audience, and differentiators",
      tag: "Product",
    },
    {
      label: "Competitor Analysis",
      note: "Tracked brands and comparison notes",
      tag: "Landscape",
    },
    {
      label: "Brand Voice",
      note: "Messaging rules, tone, and examples",
      tag: "Messaging",
    },
    {
      label: "Strategic Insights",
      note: "Opportunities, gaps, and next moves",
      tag: "Strategy",
    },
  ];
  const [featuredLandingSection, ...supportingLandingSections] = landingSections;
  const landingExamples = [
    "https://linear.app",
    "https://www.notion.so",
    "https://www.reddit.com",
  ];
  const marketingPromptSuggestions = [
    `Create a LinkedIn launch post for ${brand.title} and package it for OpenClock upload.`,
    `Turn ${brand.title}'s positioning into a 3-post LinkedIn series with OpenClock-ready handoff.`,
    `Write a founder-style social post for ${brand.title} based on the strongest competitive angle.`,
  ];

  const terminalInputRef = useRef<HTMLInputElement>(null);
  const authMenuRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const openAuthModal = useCallback(() => {
    setIsAuthMenuOpen(false);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

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

  const browserAuthClient = authEnabled ? getSupabaseBrowserClient() : null;
  const terminalSessionName = currentSiteUrl
    ? truncateText(currentSiteUrl, 48)
    : DEFAULT_TERMINAL_SESSION_NAME;
  const authSetupError =
    authEnabled && !browserAuthClient
      ? "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for authentication."
      : null;
  const isAuthLoading =
    authEnabled && Boolean(browserAuthClient) ? authLoadingState : false;
  const isLocked = authEnabled && !isAuthLoading && !session?.access_token;
  const visibleAuthError = authError ?? authSetupError ?? terminalError;
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
    if (!authEnabled) {
      return;
    }

    const supabase = browserAuthClient;
    if (!supabase) {
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      }

      setSession(data.session ?? null);
      setAuthLoadingState(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession ?? null);
      setAuthLoadingState(false);

      if (nextSession) {
        setAuthError(null);
        setAuthEmail("");
        setLinkSentTo(null);
        setIsAuthModalOpen(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [authEnabled, browserAuthClient]);

  useEffect(() => {
    setBrandVoiceDoc(null);
    setBrandVoiceError(null);
    setIsBrandVoiceLoading(false);
    setChatMessages([]);
    setChatInput("");
    setIsChatLoading(false);
    setCurrentView("home");
  }, [currentSiteUrl]);

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
      setIsAuthModalOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAuthMenuOpen]);

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
    setCurrentSiteUrl(nextSiteUrl);
    setTerminalInput("");
    void analysis.startAnalysis(nextSiteUrl);
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

  async function handleSendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    const email = authEmail.trim();
    if (!email) {
      setAuthError("Enter an email address to continue.");
      return;
    }

    const supabase = browserAuthClient;
    if (!supabase) {
      setAuthError(
        "Supabase auth is not available in the browser. Check your public auth env vars.",
      );
      return;
    }

    setIsSendingLink(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setAuthError(error.message);
      setIsSendingLink(false);
      return;
    }

    setLinkSentTo(email);
    setAuthEmail("");
    setIsSendingLink(false);
  }

  async function handleGoogleSignIn() {
    setAuthError(null);

    const supabase = browserAuthClient;
    if (!supabase) {
      setAuthError(
        "Supabase auth is not available in the browser. Check your public auth env vars.",
      );
      return;
    }

    setIsGoogleLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthError(error.message);
      setIsGoogleLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = browserAuthClient;
    if (!supabase) {
      setAuthError(
        "Supabase auth is not available in the browser. Check your public auth env vars.",
      );
      return;
    }

    setAuthError(null);
    setIsAuthMenuOpen(false);

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
      return;
    }

    setSession(null);
    setIsAuthModalOpen(true);
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

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark">🦸</div>
          <div className="dashboard-brand-copy">
            <div className="dashboard-brand-name">Friday</div>
            <div className="dashboard-brand-subtitle">
              Research, write, and package social content
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

      {!isSiteLoaded && (
        <div className="landing-shell">
          <div className="landing-grid">
            <section className="card landing-story-card">
              <div className="card-body landing-story-body">
                <div className="section-kicker">Homepage</div>
                <h1 className="landing-title">From website to marketing engine.</h1>
                <p className="landing-lead">
                  Friday turns one company URL into a marketing workspace. It
                  organizes research, positioning, competitors, voice, and a
                  dedicated console for generating LinkedIn-ready posts with
                  OpenClock upload handoff.
                </p>

                <div className="landing-structure">
                  <div className="landing-structure-header">
                    <div>
                      <div className="landing-structure-title">Workspace sections</div>
                      <div className="landing-structure-note">
                        One clear homepage, then dedicated pages for the deeper work.
                      </div>
                    </div>
                  </div>

                  <div className="landing-feature-card">
                    <div className="landing-feature-icon">
                      <FileText className="icon" />
                    </div>
                    <div className="landing-feature-copy">
                      <div className="landing-feature-topline">
                        <span className="landing-feature-badge">
                          {featuredLandingSection.tag}
                        </span>
                        <span className="landing-feature-title">
                          {featuredLandingSection.label}
                        </span>
                      </div>
                      <div className="landing-feature-note">
                        {featuredLandingSection.note}
                      </div>
                    </div>
                    <ChevronRight
                      style={{ width: 18, height: 18, color: "var(--accent-strong)" }}
                    />
                  </div>

                  <div className="landing-section-grid">
                    {supportingLandingSections.map((section, index) => (
                      <div key={section.label} className="landing-section-card">
                        <div className="landing-section-top">
                          <span className="landing-section-index">
                            {String(index + 2).padStart(2, "0")}
                          </span>
                          <span className="landing-section-tag">{section.tag}</span>
                        </div>
                        <div className="landing-section-title">{section.label}</div>
                        <div className="landing-section-note">{section.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="card landing-input-card">
              <div className="card-body landing-input-body">
                <div className="section-kicker">Start Here</div>
                <div className="landing-panel-title">Paste a company website</div>
                <p className="landing-panel-copy">
                  Friday will build the workspace, map the brand context, and
                  give you a marketing console for content creation and publishing
                  handoff.
                </p>

                {isLocked && (
                  <div className="auth-lock-panel">
                    <div className="auth-lock-copy">
                      <div className="auth-lock-title">Authentication required</div>
                      <div className="auth-lock-text">
                        Sign in with your email to unlock analysis tools and
                        protected API access.
                      </div>
                    </div>
                    <button type="button" className="auth-primary-btn" onClick={openAuthModal}>
                      Sign in
                    </button>
                  </div>
                )}

                {visibleAuthError && <div className="auth-inline-error">{visibleAuthError}</div>}

                <form onSubmit={handleTerminalSubmit} className="landing-form">
                  <label className="landing-field-label" htmlFor="site-url-input">
                    Website URL
                  </label>
                  <div className="workspace-input-shell workspace-input-shell-large">
                    <div className="workspace-input-prefix">
                      {analysis.isRunning ? (
                        <span className="terminal-cursor" />
                      ) : (
                        <span>&gt;</span>
                      )}
                    </div>
                    <input
                      id="site-url-input"
                      ref={terminalInputRef}
                      type="text"
                      value={terminalInput}
                      onChange={(event) => {
                        if (!isLocked) {
                          setTerminalInput(event.target.value);
                          setTerminalError(null);
                        }
                      }}
                      onFocus={() => {
                        if (isLocked) {
                          openAuthModal();
                        }
                      }}
                      disabled={isAuthLoading}
                      readOnly={isLocked}
                      placeholder={
                        isAuthLoading
                          ? "Checking your session..."
                          : isLocked
                            ? "Sign in to start a protected session..."
                            : analysis.isRunning
                              ? "Analyzing website..."
                              : "https://company.com"
                      }
                      className="workspace-input"
                      autoFocus={!authEnabled}
                    />
                  </div>
                  <button
                    type="submit"
                    className="auth-primary-btn landing-submit-button"
                    disabled={isAuthLoading || analysis.isRunning}
                  >
                    {analysis.isRunning ? "Analyzing..." : "Open workspace"}
                  </button>
                </form>

                <div className="landing-example-block">
                  <div className="landing-example-label">Try an example</div>
                  <div className="landing-example-list">
                    {landingExamples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="landing-example-chip"
                        onClick={() => {
                          if (isLocked) {
                            openAuthModal();
                            return;
                          }
                          setTerminalInput(example);
                          setTerminalError(null);
                          terminalInputRef.current?.focus();
                        }}
                      >
                        {example.replace(/^https?:\/\//, "")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="landing-status-line">
                  <span className="landing-status-label">Status</span>
                  <span>{terminalStatus}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {isSiteLoaded && (
        <div className="workspace-bar card">
          <div className="card-body workspace-bar-body">
            <div className="workspace-bar-copy">
              <div className="section-kicker">Current Workspace</div>
              <div className="workspace-bar-title">{workspaceTitle}</div>
              <p className="workspace-bar-text">{currentSiteUrl}</p>
            </div>

            <div className="workspace-bar-summary">
              <div className="workspace-bar-badges">
                <span className="status-chip status-chip-accent">{terminalStatus}</span>
                {workspaceDomain && <span className="status-chip">{workspaceDomain}</span>}
                {analysis.currentStep > 0 && analysis.currentStep <= 4 && (
                  <span className="status-chip">Step {analysis.currentStep} of 4</span>
                )}
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

      {isSiteLoaded && currentView === "home" && (
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
                        : "Generate LinkedIn posts, campaign angles, and OpenClock-ready upload packets from the current brand context."}
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

      {isSiteLoaded && currentView === "company-report" && (
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

      {isSiteLoaded && currentView === "marketing-console" && (
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
                      Ask Friday to draft social posts, messaging angles, campaign variants,
                      or LinkedIn-ready copy. Responses are packaged for OpenClock/manual
                      upload. Live publishing is not connected in this build.
                    </div>
                    <div className="flex" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <span className="status-chip status-chip-accent">OpenClock handoff</span>
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
                        Start with a LinkedIn post, a short campaign sequence, or a
                        founder-style announcement. Friday will use the loaded research
                        and return a publish-ready package.
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
                          Building the content package...
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
                    placeholder="Ask for a LinkedIn post, a content series, or an OpenClock-ready handoff..."
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

      {isSiteLoaded && currentView === "product-information" && (
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

      {isSiteLoaded && currentView === "competitor-analysis" && (
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

      {isSiteLoaded && currentView === "brand-voice" && (
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

      {isSiteLoaded && currentView === "strategic-insights" && (
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
