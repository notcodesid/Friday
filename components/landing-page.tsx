"use client";

import { useEffect } from "react";
import type { FormEvent, RefObject } from "react";
import {
  ArrowRight,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Mail,
  MessageSquareText,
  Radar,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Process", href: "#process" },
  { label: "FAQ", href: "#faq" },
];

const LANDING_EXAMPLES = [
  "https://linear.app",
  "https://www.notion.so",
  "https://www.reddit.com",
];

const OUTPUT_CARDS = [
  {
    eyebrow: "Company read",
    title: "One URL becomes a full operating brief.",
    copy: "Friday turns a live website into product context, category framing, and the pieces needed for marketing execution.",
    wide: true,
  },
  {
    eyebrow: "Competitor map",
    title: "The landscape gets structured automatically.",
    copy: "Direct competitors, category alternatives, and positioning gaps are organized into a usable market view.",
  },
  {
    eyebrow: "Voice system",
    title: "Messaging rules become reusable.",
    copy: "Brand voice, proof points, and content direction are packaged into assets the team can actually use.",
  },
];

const SERVICE_CARDS = [
  {
    icon: Radar,
    eyebrow: "Research",
    title: "Product and market intelligence",
    copy: "Positioning, audience, differentiators, and competitor context pulled from the company site and the web.",
  },
  {
    icon: MessageSquareText,
    eyebrow: "Messaging",
    title: "Brand voice and content direction",
    copy: "Clear voice guidance, social hooks, creative themes, and reusable messaging for campaigns and launch work.",
  },
  {
    icon: WandSparkles,
    eyebrow: "Output",
    title: "Assets ready for execution",
    copy: "Poster directions, ad concepts, strategy notes, and publishing-ready handoff instead of loose research docs.",
  },
];

const PROCESS_CARDS = [
  {
    step: "01",
    title: "Sign in and open a workspace",
    copy: "Friday unlocks the protected research flow only after authentication, so the start point stays clean.",
  },
  {
    step: "02",
    title: "Drop in one company URL",
    copy: "The system reads the site, extracts the product story, and starts the intelligence pipeline from that source.",
  },
  {
    step: "03",
    title: "Move into the dashboard",
    copy: "Research, competitors, voice, and strategic output are organized inside the working dashboard instead of chat threads.",
  },
];

const FAQ_CARDS = [
  {
    question: "What does Friday need to start?",
    answer: "One company URL. That gives Friday enough surface area to begin product, category, and messaging research.",
  },
  {
    question: "Can anyone paste a link on the landing page?",
    answer: "No. The landing page is public, but workspace creation stays behind authentication so the dashboard opens in the right state.",
  },
  {
    question: "What happens after sign-in?",
    answer: "You land on the dashboard entry screen, paste the URL there, and Friday opens the full company workspace.",
  },
];

/* ------------------------------------------------------------------ */
/*  DashboardEntry – rendered at /dashboard when no site is loaded     */
/* ------------------------------------------------------------------ */

type DashboardEntryProps = {
  isAnalysisRunning: boolean;
  terminalInput: string;
  visibleAuthError: string | null;
  terminalInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  landingExamples: string[];
};

function getDisplayName(session: { user: { user_metadata: Record<string, unknown>; email?: string } } | null) {
  const metadata = session?.user.user_metadata ?? {};
  if (typeof metadata.full_name === "string" && metadata.full_name.trim()) return metadata.full_name.trim();
  if (typeof metadata.name === "string" && metadata.name.trim()) return metadata.name.trim();
  if (session?.user.email) return session.user.email.split("@")[0] ?? "Operator";
  return "Operator";
}

function getAvatarUrl(session: { user: { user_metadata: Record<string, unknown> } } | null) {
  const metadata = session?.user.user_metadata ?? {};
  const candidates = [metadata.avatar_url, metadata.picture, metadata.photo_url, metadata.image];
  const value = candidates.find((c): c is string => typeof c === "string" && c.trim().length > 0);
  return value ?? null;
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).map((p) => p.trim()).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "FR";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function DashboardEntry({
  isAnalysisRunning,
  terminalInput,
  visibleAuthError,
  terminalInputRef,
  onInputChange,
  onSubmit,
  landingExamples,
}: DashboardEntryProps) {
  const { session, isAuthLoading, authEnabled, openAuthModal, handleSignOut } = useAuth();
  const displayName = getDisplayName(session);
  const avatarUrl = getAvatarUrl(session);
  const email = session?.user.email ?? "Workspace access enabled";

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg", "#050505");
    return () => {
      root.style.setProperty("--bg", "#f8fafc");
    };
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-[#f7f7f2] font-[Inter,sans-serif]">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,94,0,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_24%),linear-gradient(180deg,#050505_0%,#0a0a0a_100%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-2">
            <div className="text-[1.15rem] font-semibold tracking-[-0.05em] text-white">
              Friday<span className="text-[#ff5e00]">.</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {session ? (
              <div className="flex items-center gap-4 rounded-full border border-white/12 bg-white/5 px-4 py-2">
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={displayName} className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {getInitials(displayName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                    <div className="truncate text-xs text-white/45">{email}</div>
                  </div>
                </div>
                {authEnabled && (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white/55 transition hover:border-white/20 hover:text-white"
                  >
                    Sign out
                  </button>
                )}
              </div>
            ) : authEnabled ? (
              <button
                type="button"
                onClick={openAuthModal}
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/12 bg-white px-5 text-sm font-semibold text-[#111111] transition hover:bg-[#f4f4f1]"
              >
                Sign in
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-73px)] items-center">
        <section className="w-full px-6 py-12 md:px-10 md:py-16">
          <div className="mx-auto max-w-[1360px]">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,420px)] lg:items-start">
              <div className="rounded-[40px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,15,15,0.98)_0%,rgba(10,10,10,0.98)_100%)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.45)] md:p-12">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">
                  Dashboard
                </div>
                <h1 className="mt-7 max-w-[13ch] text-[clamp(3.4rem,6vw,5.3rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-white">
                  Paste a company URL to open the workspace.
                </h1>
                <p className="mt-8 max-w-[48rem] text-[1.08rem] leading-[1.9] text-white/58 md:max-w-[42rem]">
                  You are signed in. Add one website here and Friday opens the
                  working dashboard for company research, competitors, brand
                  voice, and creative output.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <span className="rounded-full border border-[#ff5e00]/30 bg-[#ff5e00]/10 px-4 py-2 text-sm font-semibold text-[#ff5e00]">
                    {session ? "Authenticated" : "Workspace ready"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70">
                    Load a website to start
                  </span>
                </div>
              </div>

              <div className="rounded-[36px] border border-white/10 bg-[#0d0d0d] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.28)] md:p-8">
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={displayName} className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white">
                      {getInitials(displayName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[1.1rem] font-semibold tracking-[-0.03em] text-white">
                      {session ? "Workspace unlocked" : "Workspace ready"}
                    </div>
                    <div className="truncate text-sm text-white/45">
                      {session ? `${displayName} • ${email}` : "Authentication is optional in this environment."}
                    </div>
                  </div>
                </div>

                <div className="mt-7">
                  <div className="text-sm font-semibold uppercase tracking-[0.12em] text-white/35">
                    Company URL
                  </div>
                  <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
                    <div className="flex min-h-[76px] items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-6">
                      <span className="inline-flex h-6 w-6 items-center justify-center text-[#ff5e00]">
                        {isAnalysisRunning ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <ChevronRight size={18} />
                        )}
                      </span>
                      <input
                        id="site-url-input"
                        ref={terminalInputRef}
                        type="text"
                        value={terminalInput}
                        onChange={(e) => onInputChange(e.target.value)}
                        disabled={isAuthLoading || isAnalysisRunning}
                        autoFocus
                        placeholder="https://company.com"
                        className="w-full border-0 bg-transparent text-[1.05rem] text-white outline-none placeholder:text-white/25"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthLoading || isAnalysisRunning}
                      className="inline-flex min-h-[76px] items-center justify-center rounded-[28px] bg-[#ff5e00] px-6 text-[1.25rem] font-semibold tracking-[-0.03em] text-white transition hover:bg-[#e65400] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAnalysisRunning ? "Running..." : "Open dashboard"}
                    </button>
                  </form>

                  {visibleAuthError && (
                    <div className="mt-4 rounded-2xl border border-[#ff5e00]/30 bg-[#ff5e00]/10 px-4 py-3 text-sm text-[#ff9966]">
                      {visibleAuthError}
                    </div>
                  )}

                  <div className="mt-7">
                    <div className="text-sm font-semibold uppercase tracking-[0.12em] text-white/35">
                      Try an example
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {landingExamples.map((example) => {
                        const label = example.replace(/^https?:\/\//, "").replace(/^www\./, "");
                        return (
                          <button
                            key={example}
                            type="button"
                            onClick={() => {
                              onInputChange(example);
                              terminalInputRef.current?.focus();
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-base font-medium text-white/70 transition hover:border-white/20 hover:bg-white/[0.06]"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LandingPage – rendered at / (marketing page, unauthenticated)      */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  const { authEnabled, isAuthLoading, authError, openAuthModal } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg", "#050505");
    return () => {
      root.style.setProperty("--bg", "#f8fafc");
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-[#f7f7f2] font-[Inter,sans-serif]">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,94,0,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_24%),linear-gradient(180deg,#050505_0%,#0a0a0a_100%)]" />
      <header className="sticky top-0 z-40 px-4 pt-4 md:px-8">
        <nav className="mx-auto flex h-14 max-w-[1040px] items-center gap-1 rounded-full bg-[#111111] px-3">
          <div className="flex shrink-0 items-center pl-4 pr-6">
            <span className="text-[0.95rem] font-bold tracking-[-0.02em] text-white">
              Friday<span className="text-[#ff5e00]">.</span>
            </span>
          </div>

          <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-full px-4 py-1.5 text-[0.85rem] font-medium text-white/60 transition hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="ml-auto shrink-0 pr-1">
            {authEnabled && !isAuthLoading ? (
              <button
                type="button"
                onClick={openAuthModal}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff5e00] px-6 text-[0.85rem] font-semibold text-white transition hover:bg-[#e65400]"
              >
                Get Started
              </button>
            ) : (
              <div className="inline-flex h-10 items-center justify-center rounded-full bg-white/10 px-6 text-[0.85rem] font-medium text-white/40">
                Loading...
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="px-6 pb-20 pt-10 md:px-10 md:pb-24 md:pt-12">
          <div className="mx-auto max-w-[1360px]">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(400px,460px)] lg:items-start">
              <div className="rounded-[40px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,15,15,0.98)_0%,rgba(10,10,10,0.98)_100%)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.45)] md:p-12">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">
                  AI CMO OS
                </div>
                <h1 className="mt-7 max-w-[14ch] text-[clamp(3.5rem,7vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.05em] text-white">
                  Turn one website into a working marketing system.
                </h1>
                <p className="mt-8 max-w-[48rem] text-[1.08rem] leading-[1.9] text-white/58 md:max-w-[42rem]">
                  Friday reads the product, maps the market, defines the voice,
                  and packages execution-ready assets from one company URL. The
                  landing stays clean. The real work starts after sign-in inside
                  the dashboard.
                </p>

                <div className="mt-10 grid gap-4 md:grid-cols-3">
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Research</div>
                    <div className="mt-3 text-[1.5rem] font-semibold tracking-[-0.05em] text-white">Product read</div>
                    <p className="mt-3 text-sm leading-7 text-white/45">Positioning, audience, proof points, and category context.</p>
                  </div>
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Market</div>
                    <div className="mt-3 text-[1.5rem] font-semibold tracking-[-0.05em] text-white">Competitor map</div>
                    <p className="mt-3 text-sm leading-7 text-white/45">Direct competitors, alternatives, and whitespace to attack.</p>
                  </div>
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Output</div>
                    <div className="mt-3 text-[1.5rem] font-semibold tracking-[-0.05em] text-white">Assets to ship</div>
                    <p className="mt-3 text-sm leading-7 text-white/45">Brand voice, creative direction, and publishing-ready copy.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.98)_0%,rgba(12,12,12,0.98)_100%)] p-7 text-white shadow-[0_30px_80px_rgba(0,0,0,0.28)] md:p-8">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">Start</div>
                <h2 className="mt-5 max-w-[11ch] text-[clamp(2.8rem,4.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.05em] text-white">
                  Open the workspace from a company URL.
                </h2>
                <p className="mt-6 text-lg leading-[1.8] text-white/55">
                  Sign in first, then Friday sends you straight to the dashboard
                  entry screen where the company URL lives.
                </p>

                {authError && (
                  <div className="mt-6 rounded-[24px] border border-[#ff5e00]/25 bg-[#ff5e00]/10 px-5 py-4 text-sm text-[#ffb28a]">
                    {authError}
                  </div>
                )}

                <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[1.35rem] font-semibold tracking-[-0.04em] text-white">
                        Authentication required
                      </div>
                      <p className="mt-2 text-sm leading-7 text-white/48">
                        Workspace creation is protected. The landing page stays
                        focused, and the URL input only appears after sign-in.
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff5e00]/12 text-[#ff5e00]">
                      <LayoutDashboard size={22} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openAuthModal}
                    disabled={isAuthLoading}
                    className="mt-6 inline-flex min-h-[64px] w-full items-center justify-center gap-3 rounded-[24px] bg-[#ff5e00] px-6 text-lg font-semibold tracking-[-0.03em] text-white transition hover:bg-[#e65400] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAuthLoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Checking session
                      </>
                    ) : (
                      <>
                        <Mail size={18} />
                        Sign in to continue
                      </>
                    )}
                  </button>

                  <div className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-white/32">
                    Example workspaces
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {LANDING_EXAMPLES.map((example) => (
                      <div
                        key={example}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/68"
                      >
                        {example.replace(/^https?:\/\//, "").replace(/^www\./, "")}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-t border-white/8 px-6 py-20 md:px-10 md:py-24">
          <div className="mx-auto grid max-w-[1360px] gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">About Friday</div>
              <h2 className="mt-5 max-w-[12ch] text-[clamp(2.8rem,4.8vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-white">
                Strategy, research, and execution in one calmer flow.
              </h2>
            </div>
            <div className="space-y-5 text-[1.04rem] leading-[1.9] text-white/52">
              <p>
                Friday is built for teams that need to understand a company fast,
                turn that into a market position, and move directly into marketing
                output without scattering work across documents and prompt threads.
              </p>
              <p>
                The product starts from a website, but the outcome is a working
                dashboard: company report, competitor analysis, brand voice,
                strategic insights, and assets to publish.
              </p>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 md:px-10 md:pb-24">
          <div className="mx-auto grid max-w-[1360px] gap-5 md:grid-cols-3">
            {OUTPUT_CARDS.map((card) => (
              <div
                key={card.title}
                className={`rounded-[32px] border border-white/10 bg-[#0d0d0d] p-7 md:p-8 ${card.wide ? "md:col-span-2" : ""}`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff5e00]">{card.eyebrow}</div>
                <h3 className="mt-5 max-w-[12ch] text-[clamp(1.8rem,3.2vw,3rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-white">{card.title}</h3>
                <p className="mt-5 max-w-[50ch] text-[0.98rem] leading-[1.85] text-white/48">{card.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="services" className="border-t border-white/8 px-6 py-20 md:px-10 md:py-24">
          <div className="mx-auto max-w-[1360px]">
            <div className="max-w-[760px]">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">Services</div>
              <h2 className="mt-5 max-w-[12ch] text-[clamp(2.8rem,4.8vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-white">
                A landing page outside. A real operator workspace inside.
              </h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {SERVICE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className="rounded-[32px] border border-white/10 bg-[#0d0d0d] p-7 md:p-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#151515] text-[#ff5e00]">
                      <Icon size={22} />
                    </div>
                    <div className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-white/32">{card.eyebrow}</div>
                    <h3 className="mt-4 text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.05em] text-white">{card.title}</h3>
                    <p className="mt-4 text-[0.96rem] leading-[1.8] text-white/48">{card.copy}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="process" className="bg-[#f5f1eb] px-6 py-20 text-[#111111] md:px-10 md:py-24">
          <div className="mx-auto max-w-[1360px]">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">Process</div>
                <h2 className="mt-5 max-w-[10ch] text-[clamp(2.8rem,4.8vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-[#111111]">
                  How Friday moves from URL to dashboard.
                </h2>
              </div>
              <div className="grid gap-4">
                {PROCESS_CARDS.map((card) => (
                  <div key={card.step} className="rounded-[28px] border border-[#e3dbd0] bg-white p-6 md:p-7">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff5e00]">({card.step})</div>
                    <h3 className="mt-4 text-[1.5rem] font-semibold tracking-[-0.05em] text-[#111111]">{card.title}</h3>
                    <p className="mt-3 max-w-[52ch] text-[0.96rem] leading-[1.8] text-[#6e6a63]">{card.copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="px-6 py-20 md:px-10 md:py-24">
          <div className="mx-auto max-w-[1360px]">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">FAQ</div>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              {FAQ_CARDS.map((card) => (
                <div key={card.question} className="rounded-[32px] border border-white/10 bg-[#0d0d0d] p-7">
                  <h3 className="text-[1.28rem] font-semibold leading-[1.25] tracking-[-0.04em] text-white">{card.question}</h3>
                  <p className="mt-4 text-[0.94rem] leading-[1.8] text-white/48">{card.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 md:px-10 md:pb-24">
          <div className="mx-auto flex max-w-[1360px] flex-col gap-8 rounded-[40px] border border-white/10 bg-[linear-gradient(135deg,#101010_0%,#141414_100%)] p-8 md:flex-row md:items-end md:justify-between md:p-12">
            <div className="max-w-[720px]">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5e00]">Ready to start</div>
              <h2 className="mt-5 max-w-[12ch] text-[clamp(2.8rem,4.6vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-white">
                Sign in, open the dashboard, and start from the company site.
              </h2>
              <p className="mt-5 max-w-[42rem] text-[1rem] leading-[1.9] text-white/52">
                The public page is for orientation. The URL input, research flow,
                and workspace state live inside the product where they belong.
              </p>
            </div>
            <button
              type="button"
              onClick={openAuthModal}
              className="inline-flex min-h-[64px] items-center justify-center gap-3 rounded-full bg-[#ff5e00] px-8 text-lg font-semibold tracking-[-0.03em] text-white transition hover:bg-[#e65400]"
            >
              <span>Sign in to continue</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 px-6 py-8 md:px-10">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="text-lg font-semibold tracking-[-0.05em]">
              Friday<span className="text-[#ff5e00]">.</span>
            </div>
            <span className="text-xs uppercase tracking-[0.14em] text-white/28">Marketing operator</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/34">
            {NAV_ITEMS.map((item) => (
              <a key={item.label} href={item.href} className="transition hover:text-white/70">
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
