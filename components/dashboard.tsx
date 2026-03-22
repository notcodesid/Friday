"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUp,
  Bot,
  CheckCircle,
  Chrome,
  ChevronRight,
  FileText,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  Newspaper,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  X,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const BRAND_SITE_URL = "https://www.tryproven.fun/";
const BRAND_DOMAIN = new URL(BRAND_SITE_URL).hostname;

type DashboardProps = {
  authEnabled: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentId?: string;
  timestamp: Date;
};

type StoredChatState = {
  draft: string;
  messages: Array<
    Omit<ChatMessage, "timestamp"> & {
      timestamp: string;
    }
  >;
};

const CHAT_STORAGE_PREFIX = "friday-terminal-chat";
const DEFAULT_TERMINAL_SESSION_NAME = "Friday CMO v1.0";

function getChatStorageKey(scope: string) {
  return `${CHAT_STORAGE_PREFIX}:${scope}`;
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function getPromptCount(messages: ChatMessage[]) {
  return messages.filter((message) => message.role === "user").length;
}

function getTerminalSessionName(messages: ChatMessage[]) {
  const firstPrompt = messages.find((message) => message.role === "user")?.content;
  if (!firstPrompt?.trim()) {
    return DEFAULT_TERMINAL_SESSION_NAME;
  }

  return truncateText(firstPrompt, 48);
}

function readStoredChat(storageKey: string): StoredChatState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredChatState>;
    if (!Array.isArray(parsed.messages)) {
      return null;
    }

    return {
      draft: typeof parsed.draft === "string" ? parsed.draft : "",
      messages: parsed.messages
        .filter(
          (message) =>
            message &&
            typeof message.id === "string" &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            typeof message.timestamp === "string",
        )
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          agentId: typeof message.agentId === "string" ? message.agentId : undefined,
          timestamp: message.timestamp,
        })),
    };
  } catch {
    return null;
  }
}

function writeStoredChat(storageKey: string, draft: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredChatState = {
    draft,
    messages: messages.map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
    })),
  };

  window.localStorage.setItem(storageKey, JSON.stringify(payload));
}

function reviveStoredMessages(
  messages: StoredChatState["messages"] | undefined,
): ChatMessage[] {
  if (!messages) {
    return [];
  }

  return messages.map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
  }));
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong.";
}

function useChat({
  accessToken,
  authRequired,
  onAuthRequired,
}: {
  accessToken?: string;
  authRequired: boolean;
  onAuthRequired: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const replaceMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
  }, []);

  const sendMessage = useCallback(
    async (content: string, agentId = "cmo") => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) {
        return;
      }

      if (authRequired && !accessToken) {
        onAuthRequired();
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        agentId,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            message: trimmed,
            agentId,
            brandContext: {
              brandName: "Proven",
              oneLiner:
                "Habit challenge app where users stake money and earn by showing up consistently",
              targetAudience:
                "people who want to build habits with financial accountability",
              brandVoice: ["sharp", "motivational", "no-fluff", "founder-led"],
              siteUrl: BRAND_SITE_URL,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            onAuthRequired();
          }

          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsg.id
                ? { ...message, content: `Error: ${err.error ?? res.statusText}` }
                : message,
            ),
          );
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          accumulated += decoder.decode(value, { stream: true });
          const current = accumulated;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsg.id
                ? { ...message, content: current }
                : message,
            ),
          );
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsg.id
                ? {
                    ...message,
                    content: `Error: ${getErrorMessage(error)}`,
                  }
                : message,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [accessToken, authRequired, isStreaming, onAuthRequired],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { isStreaming, messages, replaceMessages, sendMessage, stopStreaming };
}

function ChatMessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="chat-msg chat-msg-user">
        <div className="chat-msg-avatar user-msg-avatar">
          <User style={{ width: 14, height: 14 }} />
        </div>
        <div className="chat-msg-content">
          <div className="chat-msg-text">{msg.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-msg-avatar assistant-msg-avatar">
        <Sparkles style={{ width: 14, height: 14 }} />
      </div>
      <div className="chat-msg-content">
        {msg.content ? (
          <div className="chat-msg-text">{msg.content}</div>
        ) : (
          <div className="chat-msg-text chat-typing">
            <Loader2
              className="spin"
              style={{ width: 14, height: 14, color: "var(--muted)" }}
            />
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
              Researching &amp; thinking...
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState("Health");
  const [chatInput, setChatInput] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoadingState, setAuthLoadingState] = useState(authEnabled);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const authMenuRef = useRef<HTMLDivElement>(null);

  const openAuthModal = useCallback(() => {
    setIsAuthMenuOpen(false);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const { isStreaming, messages, replaceMessages, sendMessage, stopStreaming } = useChat({
    accessToken: session?.access_token,
    authRequired: authEnabled,
    onAuthRequired: openAuthModal,
  });

  const browserAuthClient = authEnabled ? getSupabaseBrowserClient() : null;
  const chatStorageKey = authEnabled
    ? session?.user.id
      ? getChatStorageKey(session.user.id)
      : null
    : getChatStorageKey("preview");
  const promptCount = getPromptCount(messages);
  const terminalSessionName = getTerminalSessionName(messages);
  const authSetupError =
    authEnabled && !browserAuthClient
      ? "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for authentication."
      : null;
  const isAuthLoading =
    authEnabled && Boolean(browserAuthClient) ? authLoadingState : false;
  const isLocked = authEnabled && !isAuthLoading && !session?.access_token;
  const visibleAuthError = authError ?? authSetupError;
  const terminalStatus = isAuthLoading
    ? "Checking session"
    : isLocked
      ? "Authentication required"
      : promptCount > 0
        ? `${promptCount} ${promptCount === 1 ? "prompt" : "prompts"} in session`
        : "Ready — ask me anything about marketing";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      if (!chatStorageKey) {
        replaceMessages([]);
        setChatInput("");
        return;
      }

      const stored = readStoredChat(chatStorageKey);
      replaceMessages(reviveStoredMessages(stored?.messages));
      setChatInput(stored?.draft ?? "");
    });
  }, [chatStorageKey, replaceMessages]);

  useEffect(() => {
    if (!chatStorageKey) {
      return;
    }

    writeStoredChat(chatStorageKey, chatInput, messages);
  }, [chatInput, chatStorageKey, messages]);

  useEffect(() => {
    if (isLocked || isAuthLoading) {
      return;
    }

    inputRef.current?.focus();
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

  function handleChatSubmit(event?: FormEvent) {
    event?.preventDefault();

    if (isLocked) {
      openAuthModal();
      return;
    }

    if (!chatInput.trim() || isStreaming) {
      return;
    }

    void sendMessage(chatInput);
    setChatInput("");
  }

  function handleQuickAction(prompt: string) {
    if (isLocked) {
      openAuthModal();
      return;
    }

    if (isStreaming) {
      return;
    }

    void sendMessage(prompt);
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
          <div className="flex items-center gap-3">
            <button type="button" className="collapse-btn" aria-label="Collapse terminal">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <div className="terminal-title">
              <div className="brand" style={{ color: "var(--muted)" }}>
                <Bot className="icon" />
                <span className="status-dot"></span>
                <span>AI CMO Terminal • Running Daily</span>
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
          <div style={{ color: "var(--muted)", marginBottom: "24px" }}>
            <div>Your AI Chief Marketing Officer</div>
            <div>v1.0 • Powered by Claude</div>
          </div>


          <div style={{ color: "#3b82f6", marginBottom: "4px" }}>$ {terminalSessionName}</div>
          <div style={{ color: "#eab308", marginBottom: "4px" }}>&gt; {terminalStatus}</div>

          {messages.length === 0 && !isLocked && (
            <div
              style={{
                color: "#22c55e",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
                marginTop: "24px",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              AI Chat initialized
            </div>
          )}

          {isLocked && (
            <div className="auth-lock-panel">
              <div className="auth-lock-copy">
                <div className="auth-lock-title">Authentication required</div>
                <div className="auth-lock-text">
                  Sign in with your email to unlock chat, quick actions, and protected
                  API access.
                </div>
              </div>
              <button type="button" className="auth-primary-btn" onClick={openAuthModal}>
                Sign in
              </button>
            </div>
          )}

          {visibleAuthError && <div className="auth-inline-error">{visibleAuthError}</div>}

          <form
            onSubmit={handleChatSubmit}
            style={{ display: "flex", alignItems: "center", marginTop: "8px" }}
          >
            <div
              className={isStreaming ? "terminal-cursor" : ""}
              style={{
                width: isStreaming ? 8 : 0,
                marginRight: isStreaming ? 8 : 0,
                display: isStreaming ? "inline-block" : "none",
              }}
            ></div>
            {!isStreaming && <span style={{ color: "#22c55e", marginRight: "8px" }}>&gt;</span>}
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(event) => {
                if (!isLocked) {
                  setChatInput(event.target.value);
                }
              }}
              onFocus={() => {
                if (isLocked) {
                  openAuthModal();
                }
              }}
              disabled={isStreaming || isAuthLoading}
              readOnly={isLocked}
              placeholder={
                isAuthLoading
                  ? "Checking your session..."
                  : isLocked
                    ? "Sign in to start a protected session..."
                    : isStreaming
                      ? "Waiting for response..."
                      : "Type your message or website URL here..."
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

      {messages.length > 0 && (
        <div className="dashboard-grid">
          <div className="column">
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-2">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${BRAND_DOMAIN}&sz=32`}
                    alt="Proven"
                    style={{ width: 16, height: 16 }}
                  />
                  <span>Proven</span>
                </div>
              </div>
              <div
                className="card-body text-sm text-muted"
                style={{ lineHeight: 1.6 }}
              >
                Users join habit challenges, lock a small financial stake, and then
                submit daily proof of completion to earn money. If they show up
                consistently, they earn; if they don&apos;t, they simply don&apos;t. The app
                supports flexible streak rules for travel, sick days, and rest days so
                real life doesn&apos;t derail progress.
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
              <div className="card-header">Competitors</div>
              <div className="card-body">
                <div className="tag-list">
                  <div className="tag-item">
                    <span
                      className="flex items-center justify-center font-bold text-xs"
                      style={{
                        width: 16,
                        height: 16,
                        background: "#fff",
                        color: "#000",
                        borderRadius: 2,
                      }}
                    >
                      F.
                    </span>
                    forfeit.app
                    <X
                      style={{
                        width: 12,
                        height: 12,
                        cursor: "pointer",
                        marginLeft: 4,
                      }}
                      className="text-muted"
                    />
                  </div>
                  <div className="tag-item">
                    <Target style={{ width: 14, height: 14, color: "#ef4444" }} />
                    stickk.com
                    <X
                      style={{
                        width: 12,
                        height: 12,
                        cursor: "pointer",
                        marginLeft: 4,
                      }}
                      className="text-muted"
                    />
                  </div>
                  <div className="tag-item">
                    <span
                      className="flex items-center justify-center text-xs"
                      style={{
                        width: 16,
                        height: 16,
                        background: "#f59e0b",
                        color: "#fff",
                        borderRadius: 2,
                      }}
                    >
                      B
                    </span>
                    beeminder.com
                    <X
                      style={{
                        width: 12,
                        height: 12,
                        cursor: "pointer",
                        marginLeft: 4,
                      }}
                      className="text-muted"
                    />
                  </div>
                  <div className="tag-item">
                    <span
                      className="flex items-center justify-center text-xs text-bold"
                      style={{
                        width: 16,
                        height: 16,
                        background: "#8b5cf6",
                        color: "#fff",
                        borderRadius: 2,
                      }}
                    >
                      W
                    </span>
                    waybetter.app
                    <X
                      style={{
                        width: 12,
                        height: 12,
                        cursor: "pointer",
                        marginLeft: 4,
                      }}
                      className="text-muted"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">Quick Actions</div>
              <div
                className="list-item"
                onClick={() =>
                  handleQuickAction(
                    "Analyze our competitor forfeit.app and find content gaps we can exploit",
                  )
                }
              >
                <div className="flex items-center">
                  <Target className="icon" />
                  <span className="text-sm">Analyze Competitors</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
              <div
                className="list-item"
                onClick={() =>
                  handleQuickAction(
                    "Write 3 LinkedIn posts about building habits with financial accountability",
                  )
                }
              >
                <div className="flex items-center">
                  <Send className="icon" />
                  <span className="text-sm">Generate Social Posts</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
              <div
                className="list-item"
                onClick={() =>
                  handleQuickAction(
                    "Write a blog post targeting the keyword 'habit tracking app with money stakes'",
                  )
                }
              >
                <div className="flex items-center">
                  <Newspaper className="icon" />
                  <span className="text-sm">Write Blog Post</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
              <div
                className="list-item"
                onClick={() =>
                  handleQuickAction(
                    "Create a 3-email welcome sequence for new Proven signups",
                  )
                }
              >
                <div className="flex items-center">
                  <MessageSquare className="icon" />
                  <span className="text-sm">Create Email Campaign</span>
                </div>
                <ChevronRight
                  className="icon text-muted"
                  style={{ width: 16, height: 16, margin: 0 }}
                />
              </div>
            </div>
          </div>

          <div className="column">
            <div className="card">
              <div
                className="card-header"
                style={{ paddingBottom: 0, borderBottom: "none" }}
              >
                Analytics Overview
              </div>
              <div className="card-body">
                <div className="tabs">
                  {["Health", "Links", "AI/GEO", "Checks"].map((tab) => (
                    <div
                      key={tab}
                      className={`tab ${activeTab === tab ? "active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </div>
                  ))}
                </div>

                <div className="p-2">
                  <div className="font-semibold text-sm mb-4">
                    Mobile Performance
                  </div>
                  <div className="performance-grid">
                    <div className="score-circle-container">
                      <div className="score-circle orange">55</div>
                      <div className="score-label">Performance</div>
                    </div>
                    <div className="score-circle-container">
                      <div className="score-circle green">96</div>
                      <div className="score-label">Accessibility</div>
                    </div>
                    <div className="score-circle-container">
                      <div className="score-circle green">100</div>
                      <div className="score-label">
                        Best
                        <br />
                        Practices
                      </div>
                    </div>
                    <div className="score-circle-container">
                      <div className="score-circle green">92</div>
                      <div className="score-label">SEO</div>
                    </div>
                  </div>

                  <div className="font-semibold text-sm mb-4 mt-6">
                    Desktop Performance
                  </div>
                  <div className="performance-grid">
                    <div className="score-circle-container">
                      <div className="score-circle orange">73</div>
                      <div className="score-label">Performance</div>
                    </div>
                    <div className="score-circle-container">
                      <div className="score-circle green">96</div>
                      <div className="score-label">Accessibility</div>
                    </div>
                    <div className="score-circle-container">
                      <div className="score-circle green">100</div>
                      <div className="score-label">
                        Best
                        <br />
                        Practices
                      </div>
                    </div>
                    <div className="score-circle-container">
                      <div className="score-circle green">92</div>
                      <div className="score-label">SEO</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">Core Web Vitals</div>
              <div className="card-body">
                <div className="core-vitals-grid">
                  <div className="vital-card red">
                    <div className="vital-label">LCP</div>
                    <div className="vital-value">15.8s</div>
                  </div>
                  <div className="vital-card red">
                    <div className="vital-label">FCP</div>
                    <div className="vital-value">11.6s</div>
                  </div>
                  <div className="vital-card green">
                    <div className="vital-label">TBT</div>
                    <div className="vital-value">0ms</div>
                  </div>
                  <div className="vital-card green">
                    <div className="vital-label">CLS</div>
                    <div className="vital-value">0.004</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">SEO Health</div>
              <div className="list-item">
                <div className="flex items-center gap-2">
                  <CheckCircle
                    className="text-success"
                    style={{ width: 16, height: 16 }}
                  />
                  <span className="text-sm">Meta Title</span>
                </div>
                <span className="text-success font-semibold text-sm">39 chars</span>
              </div>
            </div>
          </div>

          <div className="column">
            <div className="promo-card">
              <div className="promo-icon-wrap">
                <div className="promo-icon">
                  <Bot style={{ width: 24, height: 24 }} />
                </div>
              </div>
              <div className="flex-col flex-1 gap-1">
                <div className="font-semibold text-sm">Your AI CMO is live</div>
                <div className="text-xs text-muted">
                  Powered by Claude • Real research tools
                </div>
                <div className="text-xs text-success" style={{ marginTop: 2 }}>
                  {isStreaming ? "Researching..." : "Ready"}
                </div>
              </div>
              <div
                className="status-indicator"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: isStreaming ? "var(--warning)" : "var(--success)",
                }}
              />
            </div>

            <div className="card">
              <div className="card-header">AI CMO Feed</div>
              <div
                className="feed-item"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  handleQuickAction(
                    "Find Reddit threads where people are discussing habit tracking apps or accountability apps. What subreddits should we target?",
                  )
                }
              >
                <div className="feed-item-header">
                  <div className="feed-icon reddit">
                    <MessageSquare />
                  </div>
                  <div className="feed-content">
                    <div className="feed-title">Reddit Opportunities</div>
                    <div className="feed-desc">Click to find threads</div>
                  </div>
                  <ChevronRight
                    className="feed-chevron"
                    style={{ width: 16, height: 16 }}
                  />
                </div>
              </div>
              <div
                className="feed-item"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  handleQuickAction(
                    "Analyze the SEO health of tryproven.fun and give me specific recommendations to improve rankings",
                  )
                }
              >
                <div className="feed-item-header">
                  <div className="feed-icon seo" style={{ background: "#0ea5e9" }}>
                    <Target />
                  </div>
                  <div className="feed-content">
                    <div className="feed-title">SEO + GEO Recommendations</div>
                    <div className="feed-desc">Click to analyze</div>
                  </div>
                  <ChevronRight
                    className="feed-chevron"
                    style={{ width: 16, height: 16 }}
                  />
                </div>
              </div>
              <div
                className="feed-item"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  handleQuickAction(
                    "Generate 3 SEO-optimized blog post ideas for Proven that could rank well. Research what's currently ranking for habit tracking and accountability apps.",
                  )
                }
              >
                <div className="feed-item-header">
                  <div className="feed-icon article">
                    <Newspaper />
                  </div>
                  <div className="feed-content">
                    <div className="feed-title">Articles</div>
                    <div className="feed-desc">Click to generate topics</div>
                  </div>
                  <ChevronRight
                    className="feed-chevron"
                    style={{ width: 16, height: 16 }}
                  />
                </div>
              </div>
              <div
                className="feed-item"
                style={{ borderBottom: "none", cursor: "pointer" }}
                onClick={() =>
                  handleQuickAction(
                    "Research what's trending on Hacker News around habit tracking, personal finance apps, and accountability. Draft a Show HN post for Proven.",
                  )
                }
              >
                <div className="feed-item-header">
                  <div className="feed-icon hn">
                    <span style={{ color: "#fff", fontWeight: "bold" }}>Y</span>
                  </div>
                  <div className="feed-content">
                    <div className="feed-title">Hacker News</div>
                    <div className="feed-desc">Click to draft Show HN</div>
                  </div>
                  <ChevronRight
                    className="feed-chevron"
                    style={{ width: 16, height: 16 }}
                  />
                </div>
              </div>
            </div>

            <div
              className="card"
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              <div className="card-header pl-4 pr-4 border-b">
                <span>Chat with AI CMO</span>
                {isStreaming && (
                  <button
                    type="button"
                    onClick={stopStreaming}
                    className="text-xs"
                    style={{
                      background: "var(--danger-bg)",
                      color: "var(--danger)",
                      border: "1px solid var(--danger)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <Sparkles
                      style={{
                        width: 24,
                        height: 24,
                        color: "var(--muted)",
                        marginBottom: 8,
                      }}
                    />
                    <div className="text-sm text-muted" style={{ textAlign: "center" }}>
                      Ask me anything about marketing Proven.
                      <br />I research real data before answering.
                    </div>
                  </div>
                )}
                {messages.map((msg) => (
                  <ChatMessageBubble key={msg.id} msg={msg} />
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleChatSubmit} className="chat-input-wrapper">
                <input
                  ref={inputRef}
                  type="text"
                  className="chat-input"
                  placeholder={
                    isAuthLoading
                      ? "Checking your session..."
                      : isLocked
                        ? "Sign in to ask the AI CMO..."
                        : isStreaming
                          ? "Waiting for response..."
                          : "Ask me anything..."
                  }
                  value={chatInput}
                  onChange={(event) => {
                    if (!isLocked) {
                      setChatInput(event.target.value);
                    }
                  }}
                  onFocus={() => {
                    if (isLocked) {
                      openAuthModal();
                    }
                  }}
                  disabled={isStreaming || isAuthLoading}
                  readOnly={isLocked}
                />
                <button
                  type="submit"
                  className="chat-submit"
                  disabled={isStreaming || isAuthLoading || !chatInput.trim()}
                  style={{
                    opacity:
                      isStreaming || isAuthLoading || !chatInput.trim() ? 0.4 : 1,
                  }}
                >
                  <ArrowUp style={{ width: 16, height: 16 }} />
                </button>
              </form>
            </div>
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
