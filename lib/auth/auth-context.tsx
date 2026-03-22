"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthContextValue = {
  authEnabled: boolean;
  session: Session | null;
  isAuthLoading: boolean;
  isLocked: boolean;
  canLoadWorkspace: boolean;
  authError: string | null;
  isAuthModalOpen: boolean;
  authEmail: string;
  linkSentTo: string | null;
  isSendingLink: boolean;
  isGoogleLoading: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setAuthEmail: (email: string) => void;
  setAuthError: (error: string | null) => void;
  handleSendMagicLink: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleGoogleSignIn: () => Promise<void>;
  handleSignOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export function AuthProvider({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoadingState, setAuthLoadingState] = useState(authEnabled);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const browserAuthClient = authEnabled ? getSupabaseBrowserClient() : null;

  const authSetupError =
    authEnabled && !browserAuthClient
      ? "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for authentication."
      : null;

  const isAuthLoading =
    authEnabled && Boolean(browserAuthClient) ? authLoadingState : false;
  const isLocked = authEnabled && !isAuthLoading && !session?.access_token;
  const canLoadWorkspace =
    !authEnabled || (!isAuthLoading && Boolean(session?.access_token));

  const openAuthModal = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    if (!authEnabled || !browserAuthClient) {
      setAuthLoadingState(false);
      return;
    }

    const supabase = browserAuthClient;
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session ?? null);
      setAuthLoadingState(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
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
        emailRedirectTo: `${window.location.origin}/dashboard`,
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
        redirectTo: `${window.location.origin}/dashboard`,
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

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
      return;
    }

    setSession(null);
  }

  const value: AuthContextValue = {
    authEnabled,
    session,
    isAuthLoading,
    isLocked,
    canLoadWorkspace,
    authError: authError ?? authSetupError,
    isAuthModalOpen,
    authEmail,
    linkSentTo,
    isSendingLink,
    isGoogleLoading,
    openAuthModal,
    closeAuthModal,
    setAuthEmail,
    setAuthError,
    handleSendMagicLink,
    handleGoogleSignIn,
    handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
