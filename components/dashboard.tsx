"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CheckCircle,
  Chrome,
  ChevronRight,
  FileText,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";

import type {
  CompetitorRecord,
  ProductAnalysis,
  CompetitorAnalysis,
  CompetitiveInsights,
} from "@/lib/agents/schemas";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type BrandMeta = {
  title: string;
  description: string;
  favicon: string;
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

type StoredWorkspaceState = {
  terminalDraft?: string;
  siteUrl?: string | null;
};

const WORKSPACE_STORAGE_PREFIX = "friday-workspace";
const DEFAULT_TERMINAL_SESSION_NAME = "Friday";

function getWorkspaceStorageKey(scope: string) {
  return `${WORKSPACE_STORAGE_PREFIX}:${scope}`;
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function readStoredWorkspace(storageKey: string): StoredWorkspaceState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredWorkspaceState>;

    return {
      terminalDraft:
        typeof parsed.terminalDraft === "string" ? parsed.terminalDraft : undefined,
      siteUrl: typeof parsed.siteUrl === "string" ? parsed.siteUrl : null,
    };
  } catch {
    return null;
  }
}

function writeStoredWorkspace(
  storageKey: string,
  payload: {
    terminalDraft: string;
    siteUrl: string | null;
  },
) {
  if (typeof window === "undefined") {
    return;
  }

  const stored: StoredWorkspaceState = {
    terminalDraft: payload.terminalDraft,
    siteUrl: payload.siteUrl,
  };

  window.localStorage.setItem(storageKey, JSON.stringify(stored));
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
  const initials = getInitials(displayName);

  return (
    <div className="auth-menu-shell">
      <button type="button" className="user-badge" onClick={onToggleMenu}>
        <div className="user-avatar text-xs">{initials}</div>
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
  const [hydratedWorkspaceStorageKey, setHydratedWorkspaceStorageKey] = useState<string | null>(
    null,
  );
  const [hydratedCompetitorStorageKey, setHydratedCompetitorStorageKey] = useState<string | null>(
    null,
  );
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [isDiscoveringCompetitors, setIsDiscoveringCompetitors] = useState(false);
  const isSiteLoaded = Boolean(currentSiteUrl);
  const currentDomain = currentSiteUrl ? getSiteDomain(currentSiteUrl) : "";
  const competitorStorageKey = currentSiteUrl
    ? `friday-competitors:v2:${currentDomain}`
    : null;
  const brand = useBrandMeta(currentSiteUrl);

  const analysis = useAnalysisPipeline({
    accessToken: session?.access_token,
    authRequired: authEnabled,
  });

  const terminalInputRef = useRef<HTMLInputElement>(null);
  const authMenuRef = useRef<HTMLDivElement>(null);
  const attemptedCompetitorDiscoveryKeyRef = useRef<string | null>(null);

  const openAuthModal = useCallback(() => {
    setIsAuthMenuOpen(false);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const browserAuthClient = authEnabled ? getSupabaseBrowserClient() : null;
  const workspaceStorageKey = authEnabled
    ? session?.user.id
      ? getWorkspaceStorageKey(session.user.id)
      : null
    : getWorkspaceStorageKey("preview");
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

  useEffect(() => {
    if (!competitorStorageKey || hydratedCompetitorStorageKey !== competitorStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(competitorStorageKey, JSON.stringify(competitors));
    } catch { /* ignore */ }
  }, [competitorStorageKey, competitors, hydratedCompetitorStorageKey]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!competitorStorageKey) {
        setCompetitors([]);
        setCompetitorError(null);
        setHydratedCompetitorStorageKey(null);
        return;
      }

      setIsDiscoveringCompetitors(false);

      try {
        const stored = window.localStorage.getItem(competitorStorageKey);
        if (!stored) {
          setCompetitors([]);
          setCompetitorError(null);
          setHydratedCompetitorStorageKey(competitorStorageKey);
          return;
        }

        const parsed = JSON.parse(stored) as unknown;
        setCompetitors(normalizeCompetitorRecords(parsed));
        setCompetitorError(null);
        setHydratedCompetitorStorageKey(competitorStorageKey);
      } catch {
        setCompetitors([]);
        setCompetitorError(null);
        setHydratedCompetitorStorageKey(competitorStorageKey);
      }
    });
  }, [competitorStorageKey]);

  // Sync pipeline competitor results to the left-column list
  useEffect(() => {
    if (analysis.competitors && analysis.competitors.length > 0) {
      setCompetitors(normalizeCompetitorRecords(analysis.competitors));
    }
  }, [analysis.competitors]);

  useEffect(() => {
    if (!currentSiteUrl || !competitorStorageKey) return;
    if (hydratedCompetitorStorageKey !== competitorStorageKey) return;
    if (competitors.length > 0 || isDiscoveringCompetitors) return;
    if (analysis.isRunning || analysis.competitors) return;
    if (attemptedCompetitorDiscoveryKeyRef.current === competitorStorageKey) return;
    if (authEnabled && !session?.access_token) return;

    let cancelled = false;
    attemptedCompetitorDiscoveryKeyRef.current = competitorStorageKey;
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
    competitorStorageKey,
    competitors.length,
    currentSiteUrl,
    hydratedCompetitorStorageKey,
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
    void Promise.resolve().then(() => {
      if (!workspaceStorageKey) {
        setTerminalInput("");
        setCurrentSiteUrl(null);
        setHydratedWorkspaceStorageKey(null);
        return;
      }

      const stored = readStoredWorkspace(workspaceStorageKey);
      setTerminalInput(stored?.terminalDraft ?? "");
      setCurrentSiteUrl(stored?.siteUrl ?? null);
      setHydratedWorkspaceStorageKey(workspaceStorageKey);
    });
  }, [workspaceStorageKey]);

  useEffect(() => {
    if (!workspaceStorageKey || hydratedWorkspaceStorageKey !== workspaceStorageKey) {
      return;
    }

    writeStoredWorkspace(workspaceStorageKey, {
      terminalDraft: terminalInput,
      siteUrl: currentSiteUrl,
    });
  }, [currentSiteUrl, hydratedWorkspaceStorageKey, terminalInput, workspaceStorageKey]);

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
    if (!competitorStorageKey) {
      return;
    }

    attemptedCompetitorDiscoveryKeyRef.current = null;
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

  return (
    <div className="dashboard-container">
      <div className="terminal-card">
        <div className="terminal-header">
          <div className="flex items-center">
            <div className="terminal-title">
              <div className="brand" style={{ color: "var(--muted)" }}>
                <span>Friday</span>
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

        <div className="terminal-content">
          <div style={{ color: "#3b82f6", marginBottom: "4px" }}>$ {terminalSessionName}</div>
          <div style={{ color: "#eab308", marginBottom: "4px" }}>&gt; {terminalStatus}</div>

          {isLocked && (
            <div className="auth-lock-panel">
              <div className="auth-lock-copy">
                <div className="auth-lock-title">Authentication required</div>
                <div className="auth-lock-text">
                  Sign in with your email to unlock analysis tools and protected API
                  access.
                </div>
              </div>
              <button type="button" className="auth-primary-btn" onClick={openAuthModal}>
                Sign in
              </button>
            </div>
          )}

          {visibleAuthError && <div className="auth-inline-error">{visibleAuthError}</div>}

          <form
            onSubmit={handleTerminalSubmit}
            style={{ display: "flex", alignItems: "center", marginTop: "8px" }}
          >
            <div
              className={analysis.isRunning ? "terminal-cursor" : ""}
              style={{
                width: analysis.isRunning ? 8 : 0,
                marginRight: analysis.isRunning ? 8 : 0,
                display: analysis.isRunning ? "inline-block" : "none",
              }}
            ></div>
            {!analysis.isRunning && (
              <span style={{ color: "#22c55e", marginRight: "8px" }}>&gt;</span>
            )}
            <input
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
                      : "Paste a website URL here..."
              }
              style={{
                background: "transparent",
                border: "none",
                color: "#f0f2f5",
                outline: "none",
                width: "100%",
                fontFamily: "inherit",
                fontSize: "inherit",
              }}
              autoFocus={!authEnabled}
            />
          </form>
        </div>
      </div>

      {isSiteLoaded && (
        <div className="dashboard-grid">
          <div className="column">
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brand.favicon}
                    alt={brand.title}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{brand.title}</span>
                </div>
              </div>
              <div
                className="card-body text-sm text-muted"
                style={{ lineHeight: 1.6 }}
              >
                {brand.description || "Loading brand info..."}
              </div>
            </div>

            <div className="card">
              <div className="card-header">Documents</div>
              <div className="list-item">
                <div className="flex items-center">
                  <FileText className="icon" />
                  <span className="text-sm">Competitor Analysis</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
              <div className="list-item">
                <div className="flex items-center">
                  <FileText className="icon" />
                  <span className="text-sm">Brand Voice</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
              <div className="list-item">
                <div className="flex items-center">
                  <FileText className="icon" />
                  <span className="text-sm">Product Information</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
              <div className="list-item">
                <div className="flex items-center">
                  <FileText className="icon border-0" />
                  <span className="text-sm">
                    Articles <span className="text-muted">(2)</span>
                  </span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span>Competitors</span>
                {competitorError && (
                  <button
                    type="button"
                    onClick={retryCompetitorDiscovery}
                    style={{
                      background: "var(--card-hover)",
                      color: "var(--ink)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
              <div className="card-body">
                {isDiscoveringCompetitors && competitors.length === 0 && (
                  <div
                    className="flex items-center gap-2 text-muted text-sm"
                    style={{ marginBottom: 8 }}
                  >
                    <Loader2
                      className="spin"
                      style={{ width: 14, height: 14 }}
                    />
                    Fetching live competitor data...
                  </div>
                )}
                {competitorError && (
                  <div
                    className="text-sm"
                    style={{ marginBottom: 12, lineHeight: 1.6, color: "var(--danger)" }}
                  >
                    {competitorError}
                  </div>
                )}
                {competitors.length === 0 && !isDiscoveringCompetitors && (
                  <div className="text-sm text-muted" style={{ marginBottom: 12, lineHeight: 1.6 }}>
                    No competitors loaded yet. Add a domain manually or let Friday
                    discover them from the current site.
                  </div>
                )}
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
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCompetitor(competitorInput);
                    setCompetitorInput("");
                  }}
                  style={{ marginTop: competitors.length > 0 ? 12 : 8 }}
                >
                  <input
                    type="text"
                    placeholder="Add competitor domain or URL..."
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value)}
                    style={{
                      width: "100%",
                      fontSize: "0.8rem",
                      padding: "6px 10px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                </form>
              </div>
            </div>
          </div>

          <div className="column">
            {/* Pipeline progress */}
            <div className="card">
              <div className="card-header">Analysis Pipeline</div>
              <div className="card-body" style={{ padding: "8px 16px" }}>
                {[
                  { step: 1, label: "Product Analysis" },
                  { step: 2, label: "Competitor Discovery" },
                  { step: 3, label: "Competitor Analysis" },
                  { step: 4, label: "Strategic Insights" },
                ].map(({ step, label }) => {
                  const isDone =
                    (step === 1 && analysis.productAnalysis !== null) ||
                    (step === 2 && analysis.competitors !== null) ||
                    (step === 3 && !analysis.isRunning && analysis.competitorAnalyses.length > 0 && analysis.currentStep !== 3) ||
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
                          <div
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              border: "2px solid var(--border)",
                            }}
                          />
                        )}
                      </div>
                      <div className="step-label">
                        {isActive ? analysis.stepLabel : label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Product Analysis */}
            {analysis.productAnalysis && (
              <div className="card">
                <div className="card-header">Product Analysis</div>
                <div className="card-body">
                  <div className="font-semibold text-sm">
                    {analysis.productAnalysis.brandName}
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                    {analysis.productAnalysis.oneLiner}
                  </div>
                  <div className="text-xs" style={{ marginTop: 8, color: "var(--ink)", lineHeight: 1.6 }}>
                    {analysis.productAnalysis.positioning}
                  </div>

                  {analysis.productAnalysis.targetAudience.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Target Audience
                      </div>
                      <div className="flex" style={{ flexWrap: "wrap", gap: 4 }}>
                        {analysis.productAnalysis.targetAudience.map((a) => (
                          <span key={a} className="analysis-tag">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.productAnalysis.painPoints.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Pain Points Addressed
                      </div>
                      {analysis.productAnalysis.painPoints.map((p) => (
                        <div key={p} className="analysis-list-item">{p}</div>
                      ))}
                    </div>
                  )}

                  {analysis.productAnalysis.differentiators.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Differentiators
                      </div>
                      {analysis.productAnalysis.differentiators.map((d) => (
                        <div key={d} className="analysis-list-item">{d}</div>
                      ))}
                    </div>
                  )}

                  {analysis.productAnalysis.brandVoice.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Brand Voice
                      </div>
                      <div className="flex" style={{ flexWrap: "wrap", gap: 4 }}>
                        {analysis.productAnalysis.brandVoice.map((v) => (
                          <span key={v} className="analysis-tag">{v}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Competitors Found */}
            {analysis.competitors && analysis.competitors.length > 0 && (
              <div className="card">
                <div className="card-header">
                  Competitors Found
                  <span className="text-xs text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                    {analysis.competitors.length}
                  </span>
                </div>
                <div className="card-body" style={{ padding: "4px 16px" }}>
                  {analysis.competitors.map((c) => (
                    <div
                      key={c.domain}
                      className="flex items-center gap-2"
                      style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.logo || `https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`}
                        alt=""
                        style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="text-sm font-semibold" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.name}
                        </div>
                        <div className="text-xs text-muted">{c.domain}</div>
                      </div>
                      {c.positioning && (
                        <div className="text-xs text-muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {c.positioning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitor Analyses */}
            {analysis.competitorAnalyses.map((ca) => (
              <div key={ca.domain} className="card">
                <div className="card-header">
                  <span>{ca.name}</span>
                  <span className="text-xs text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                    {ca.domain}
                  </span>
                </div>
                <div className="card-body">
                  <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.6 }}>
                    {ca.positioning}
                  </div>

                  {ca.strengths.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Strengths
                      </div>
                      <div className="flex" style={{ flexWrap: "wrap", gap: 4 }}>
                        {ca.strengths.map((s) => (
                          <span key={s} className="analysis-tag strength-tag">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {ca.weaknesses.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Weaknesses
                      </div>
                      <div className="flex" style={{ flexWrap: "wrap", gap: 4 }}>
                        {ca.weaknesses.map((w) => (
                          <span key={w} className="analysis-tag weakness-tag">{w}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {ca.contentStrategy && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Content Strategy
                      </div>
                      <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.5 }}>
                        <strong>Tone:</strong> {ca.contentStrategy.tone}
                        {ca.contentStrategy.cadence && (
                          <> &middot; <strong>Cadence:</strong> {ca.contentStrategy.cadence}</>
                        )}
                      </div>
                      {ca.contentStrategy.channels.length > 0 && (
                        <div className="flex" style={{ flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                          {ca.contentStrategy.channels.map((ch) => (
                            <span key={ch} className="analysis-tag">{ch}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {ca.pricingModel && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                        Pricing
                      </div>
                      <div className="text-xs" style={{ color: "var(--ink)" }}>
                        {ca.pricingModel}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Competitive Insights */}
            {analysis.insights && (
              <div className="card">
                <div className="card-header">Competitive Insights</div>
                <div className="card-body">
                  {analysis.insights.opportunities.length > 0 && (
                    <div>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Opportunities
                      </div>
                      {analysis.insights.opportunities.map((o) => (
                        <div key={o} className="analysis-list-item">{o}</div>
                      ))}
                    </div>
                  )}

                  {analysis.insights.gaps.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Competitive Gaps
                      </div>
                      {analysis.insights.gaps.map((g) => (
                        <div key={g} className="analysis-list-item">{g}</div>
                      ))}
                    </div>
                  )}

                  {analysis.insights.recommendations.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Recommendations
                      </div>
                      {analysis.insights.recommendations.map((r) => (
                        <div key={r} className="analysis-list-item">{r}</div>
                      ))}
                    </div>
                  )}

                  {analysis.insights.positioningAdvice && (
                    <div style={{ marginTop: 12 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
                        Positioning Advice
                      </div>
                      <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.6 }}>
                        {analysis.insights.positioningAdvice}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Errors */}
            {analysis.errors.length > 0 && (
              <div className="card">
                <div className="card-header" style={{ color: "var(--danger)" }}>
                  Errors
                </div>
                <div className="card-body">
                  {analysis.errors.map((e, i) => (
                    <div key={i} className="text-xs" style={{ color: "var(--danger)", padding: "4px 0" }}>
                      Step {e.step}: {e.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
