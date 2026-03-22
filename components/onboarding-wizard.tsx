"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Globe,
  Github,
  Loader2,
  LogOut,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type { ProductAnalysis } from "@/lib/agents/schemas";

export type WizardStep = 1 | 2 | 3 | 4;

type OnboardingWizardProps = {
  isAnalysisRunning: boolean;
  terminalInput: string;
  visibleAuthError: string | null;
  terminalInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (e?: FormEvent) => void;
  landingExamples: string[];
  analysisCurrentStep: number;
  stepLabel: string;
  productAnalysis: ProductAnalysis | null;
  analysisErrors: Array<{ step: number | string; message: string }>;
  initialStep?: WizardStep;
  onBackFromStep2?: () => void;
  onContinueFromStep1?: () => void;
  onComplete: () => void;
};

const SOURCES = [
  {
    id: "website" as const,
    icon: Globe,
    title: "Website",
    description: "Import from URL",
    note: "Best for company sites, product pages, and landing pages.",
    available: true,
  },
  {
    id: "github" as const,
    icon: Github,
    title: "GitHub Repo",
    description: "Code analyzed, never stored",
    note: "Useful for developer tools and open-source products.",
    available: false,
  },
  {
    id: "appstore" as const,
    icon: Smartphone,
    title: "App Store",
    description: "iOS or Android app",
    note: "For mobile-first products and app store positioning.",
    available: false,
  },
];

const STEP_SUMMARY = {
  1: {
    eyebrow: "Source",
    title: "Choose the input that will open your workspace.",
    copy:
      "Start with a website today. Friday will use that source to build the company report, category view, and initial marketing system.",
  },
  2: {
    eyebrow: "Website",
    title: "Paste the company URL and let Friday start reading.",
    copy:
      "Use the main company site or the strongest product page. Friday uses that page as the starting point for research and workspace setup.",
  },
  3: {
    eyebrow: "Analysis",
    title: "Friday is assembling the first version of your workspace.",
    copy:
      "The product is being read, positioned, and organized into a structured company profile before you enter the dashboard.",
  },
  4: {
    eyebrow: "Review",
    title: "Confirm the product profile before entering the workspace.",
    copy:
      "These details become the base layer for reports, voice guidance, and later content generation inside Friday.",
  },
} as const;

const ANALYSIS_PHASES = [
  "Reading the website",
  "Structuring the product",
  "Mapping the category",
  "Preparing the workspace",
];

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i + 1 === current
              ? "w-7 bg-white"
              : i + 1 < current
                ? "w-2 bg-white/42"
                : "w-2 bg-white/18"
          }`}
        />
      ))}
    </div>
  );
}

function getDisplayName(session: { user: { user_metadata: Record<string, unknown>; email?: string } } | null) {
  const metadata = session?.user.user_metadata ?? {};
  if (typeof metadata.full_name === "string" && metadata.full_name.trim()) {
    return metadata.full_name.trim();
  }
  if (typeof metadata.name === "string" && metadata.name.trim()) {
    return metadata.name.trim();
  }
  if (session?.user.email) {
    return session.user.email.split("@")[0] ?? "Operator";
  }
  return "Operator";
}

function getAvatarUrl(session: { user: { user_metadata: Record<string, unknown> } } | null) {
  const metadata = session?.user.user_metadata ?? {};
  const candidates = [metadata.avatar_url, metadata.picture, metadata.photo_url, metadata.image];
  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? null
  );
}

export function OnboardingWizard({
  isAnalysisRunning,
  terminalInput,
  visibleAuthError,
  terminalInputRef,
  onInputChange,
  onSubmit,
  landingExamples,
  analysisCurrentStep,
  stepLabel,
  productAnalysis,
  analysisErrors,
  initialStep = 1,
  onBackFromStep2,
  onContinueFromStep1,
  onComplete,
}: OnboardingWizardProps) {
  const { session, handleSignOut } = useAuth();
  const [wizardStep, setWizardStep] = useState<WizardStep>(initialStep);
  const [selectedSource, setSelectedSource] = useState<string | null>("website");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [submittedUrl, setSubmittedUrl] = useState("");

  useEffect(() => {
    setWizardStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    if (wizardStep === 3 && productAnalysis) {
      const timer = setTimeout(() => setWizardStep(4), 800);
      return () => clearTimeout(timer);
    }
  }, [wizardStep, productAnalysis]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg", "#050505");
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleContinueStep2() {
    if (!terminalInput.trim()) return;
    setSubmittedUrl(terminalInput.trim());
    setWizardStep(3);
    onSubmit();
  }

  const displayName = getDisplayName(session);
  const avatarUrl = getAvatarUrl(session);
  const currentStepMeta = STEP_SUMMARY[wizardStep];
  const normalizedUrl =
    submittedUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "") ||
    terminalInput.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

  return (
    <div className="relative min-h-screen bg-[#050505] text-white font-[Inter,sans-serif]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,94,0,0.14),transparent_24%),radial-gradient(circle_at_top_center,rgba(255,138,61,0.08),transparent_24%),linear-gradient(180deg,#050505_0%,#090909_100%)]" />

      <header className="sticky top-0 z-40 px-6 pt-5 md:px-10 md:pt-6">
        <div className="mx-auto max-w-[1360px]">
          <div className="relative flex min-h-[78px] items-center justify-between rounded-full border border-white/10 bg-[#121212]/92 px-6 shadow-[0_22px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl md:px-10">
            <div className="flex items-center gap-2">
              <div className="text-[1.15rem] font-semibold tracking-[-0.05em] text-white">
                Friday<span className="text-[#ff5e00]">.</span>
              </div>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              <div className="pointer-events-auto flex items-center gap-4 rounded-full px-2 py-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/48">
                  Step {wizardStep} of 4
                </span>
                <StepDots current={wizardStep} total={4} />
              </div>
            </div>

            <div className="relative flex items-center gap-3" ref={userMenuRef}>
              {session && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowUserMenu((v) => !v)}
                    className="rounded-full border border-white/10 bg-white/[0.04] p-1.5 transition hover:border-white/20"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                        {displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-2 min-w-[200px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                      <div className="px-3 py-2">
                        <div className="text-sm font-semibold text-white">{displayName}</div>
                        <div className="text-xs text-white/40">{session.user.email}</div>
                      </div>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          handleSignOut();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/8 hover:text-white"
                      >
                        <LogOut size={15} />
                        Sign out
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto grid max-w-[1360px] gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(460px,0.85fr)]">
          <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,#101521_0%,#0b1019_100%)] p-8 text-white shadow-[0_34px_90px_rgba(15,23,42,0.18)] md:p-10">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-[#ff8a3d]">
              {currentStepMeta.eyebrow}
            </div>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3rem,5.8vw,5.4rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-white">
              {currentStepMeta.title}
            </h1>
            <p className="mt-6 max-w-[44rem] text-[1.02rem] leading-[1.85] text-white/62">
              {currentStepMeta.copy}
            </p>

            <div className="mt-10 grid gap-4">
              {[1, 2, 3, 4].map((step) => {
                const isCurrent = wizardStep === step;
                const isDone = wizardStep > step;
                const title =
                  step === 1
                    ? "Choose a source"
                    : step === 2
                      ? "Connect the website"
                      : step === 3
                        ? "Analyze the company"
                        : "Review the profile";
                const note =
                  step === 1
                    ? "Website is available now. Other inputs can come later."
                    : step === 2
                      ? "Paste the public company URL that best represents the product."
                      : step === 3
                        ? "Friday structures the first research layer automatically."
                        : "Confirm the extracted product details before entering the app.";

                return (
                  <div
                    key={step}
                    className={`rounded-[24px] border px-5 py-5 transition ${
                      isCurrent
                        ? "border-[#ff8a3d]/40 bg-white/[0.06]"
                        : isDone
                          ? "border-white/10 bg-white/[0.04]"
                          : "border-white/8 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                          isCurrent
                            ? "bg-[#ff5e00] text-white"
                            : isDone
                              ? "bg-white/12 text-white"
                              : "bg-white/6 text-white/52"
                        }`}
                      >
                        {isDone ? <Check size={16} /> : `0${step}`}
                      </div>
                      <div>
                        <div
                          className={`text-[1rem] font-semibold tracking-[-0.03em] ${
                            isCurrent ? "text-white" : isDone ? "text-white/90" : "text-white/72"
                          }`}
                        >
                          {title}
                        </div>
                        <p className="mt-2 max-w-[42ch] text-sm leading-7 text-white/48">
                          {note}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {normalizedUrl && (
              <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white/76">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#ff5e00]" />
                <span>{normalizedUrl}</span>
              </div>
            )}
          </section>

          <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,#121212_0%,#0c0c0c_100%)] p-7 text-white shadow-[0_24px_64px_rgba(0,0,0,0.24)] md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                  Setup flow
                </div>
                <div className="mt-2 text-[1.5rem] font-semibold tracking-[-0.04em] text-white">
                  {wizardStep === 1
                    ? "Connect your app"
                    : wizardStep === 2
                      ? "Add the website URL"
                      : wizardStep === 3
                        ? "Analysis is running"
                        : "Review app details"}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/48">
                Step {wizardStep} / 4
              </div>
            </div>

            <div className="mt-8">
              {wizardStep === 1 && (
                <div className="animate-[fadeIn_0.3s_ease-out]">
                  <p className="max-w-[38rem] text-[1rem] leading-[1.8] text-white/55">
                    Start with the product website. GitHub and App Store inputs are
                    reserved for later expansion and do not block the current flow.
                  </p>

                  <div className="mt-8 space-y-4">
                    {SOURCES.map((source) => {
                      const Icon = source.icon;
                      const isSelected = selectedSource === source.id;

                      return (
                        <button
                          key={source.id}
                          type="button"
                          disabled={!source.available}
                          onClick={() => setSelectedSource(source.id)}
                          className={`group w-full rounded-[28px] border p-5 text-left transition-all duration-200 ${
                            !source.available
                              ? "cursor-not-allowed border-white/8 bg-white/[0.02] opacity-60"
                              : isSelected
                                ? "border-[#ff5e00]/30 bg-[#16100d] shadow-[0_18px_36px_rgba(255,94,0,0.14)]"
                                : "border-white/10 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                                isSelected
                                  ? "bg-[#ff5e00]/12 text-[#ff8a3d]"
                                  : source.available
                                    ? "bg-white/[0.06] text-white/72"
                                    : "bg-white/[0.04] text-white/28"
                              }`}
                            >
                              <Icon size={26} strokeWidth={1.7} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-[1.05rem] font-semibold tracking-[-0.03em] text-white">
                                  {source.title}
                                </div>
                                {source.available && source.id === "website" && (
                                  <span className="rounded-full border border-[#ff5e00]/25 bg-[#2a160b] px-2.5 py-1 text-xs font-semibold text-[#ff8a3d]">
                                    Recommended
                                  </span>
                                )}
                                {!source.available && (
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/38">
                                    Soon
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-sm text-white/58">{source.description}</div>
                              <p className="mt-3 text-sm leading-7 text-white/34">{source.note}</p>
                            </div>
                            <div
                              className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                                isSelected
                                  ? "border-[#ff5e00]/20 bg-[#ff5e00] text-white"
                                  : "border-white/10 bg-white/[0.04] text-white/38"
                              }`}
                            >
                              {isSelected ? <Check size={16} /> : <ChevronRight size={16} />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="animate-[fadeIn_0.3s_ease-out]">
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                      Website URL
                    </div>
                    <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-white/10 bg-[#0d1118] px-5 py-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff5e00]/12 text-[#ff8a3d]">
                        <Globe size={18} />
                      </div>
                      <input
                        ref={terminalInputRef}
                        type="text"
                        value={terminalInput}
                        onChange={(e) => onInputChange(e.target.value)}
                        autoFocus
                        placeholder="https://example.com"
                        className="w-full border-0 bg-transparent text-[1.02rem] text-white outline-none placeholder:text-white/24"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleContinueStep2();
                          }
                        }}
                      />
                    </div>
                    <p className="mt-4 text-sm leading-7 text-white/50">
                      Use the main company site or strongest product page, for example
                      {" "}
                      <span className="font-medium text-white/78">https://company.com</span>.
                    </p>
                  </div>

                  {visibleAuthError && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                      {visibleAuthError}
                    </div>
                  )}

                  <div className="mt-8">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                      Example URLs
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {landingExamples.map((example) => {
                        const label = example
                          .replace(/^https?:\/\//, "")
                          .replace(/^www\./, "");

                        return (
                          <button
                            key={example}
                            type="button"
                            onClick={() => {
                              onInputChange(example);
                              terminalInputRef.current?.focus();
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/60 transition hover:border-white/18 hover:text-white"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="animate-[fadeIn_0.3s_ease-out]">
                  <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/72">
                    {normalizedUrl}
                  </div>

                  <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff5e00]/12 text-[#ff8a3d]">
                        <Loader2 size={18} className="animate-spin" />
                      </div>
                      <div>
                        <div className="text-[1.05rem] font-semibold tracking-[-0.03em] text-white">
                          {stepLabel || "Starting analysis"}
                        </div>
                        <div className="text-sm text-white/50">
                          Friday is preparing the first company snapshot.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {ANALYSIS_PHASES.map((phase, index) => {
                      const phaseNumber = index + 1;
                      const isDone = analysisCurrentStep > phaseNumber || Boolean(productAnalysis);
                      const isActive =
                        !productAnalysis &&
                        (analysisCurrentStep === phaseNumber ||
                          (analysisCurrentStep === 0 && phaseNumber === 1));

                      return (
                        <div
                          key={phase}
                          className={`flex items-center gap-4 rounded-[22px] border px-5 py-4 ${
                            isActive
                              ? "border-[#ff5e00]/20 bg-[#16100d]"
                              : isDone
                                ? "border-white/10 bg-white/[0.03]"
                                : "border-white/8 bg-white/[0.02]"
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                              isActive
                                ? "bg-[#ff5e00] text-white"
                                : isDone
                                  ? "bg-[#111111] text-white"
                                  : "border border-white/10 bg-white/[0.04] text-white/34"
                              }`}
                          >
                            {isActive ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : isDone ? (
                              <Check size={16} />
                            ) : (
                              <span className="text-xs font-semibold">{`0${phaseNumber}`}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold ${isActive ? "text-white" : isDone ? "text-white" : "text-white/56"}`}>
                              {isActive && stepLabel ? stepLabel : phase}
                            </div>
                            <div className="mt-1 text-sm text-white/34">
                              {isActive ? "Running now" : isDone ? "Complete" : "Waiting"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {analysisErrors.length > 0 && (
                    <div className="mt-6">
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                        {analysisErrors[analysisErrors.length - 1].message}
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="mt-4 text-sm font-medium text-[#ff8a3d] transition hover:text-[#ff5e00]"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 4 && productAnalysis && (
                <div className="animate-[fadeIn_0.3s_ease-out]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                        App name
                      </div>
                      <div className="mt-3 text-[1.4rem] font-semibold tracking-[-0.04em] text-white">
                        {productAnalysis.brandName}
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                        Tagline
                      </div>
                      <div className="mt-3 text-[1.1rem] font-semibold tracking-[-0.03em] text-white">
                        {productAnalysis.oneLiner}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                      App description
                    </div>
                    <p className="mt-4 text-[1rem] leading-[1.85] text-white/68">
                      {productAnalysis.positioning}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                        Target audience
                      </div>
                      <div className="mt-3 text-sm leading-7 text-white/68">
                        {productAnalysis.targetAudience[0] ?? "General"}
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                        Brand voice
                      </div>
                      <div className="mt-3 text-sm leading-7 text-white/68">
                        {productAnalysis.brandVoice[0] ?? "Professional"}
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                        Primary CTA
                      </div>
                      <div className="mt-3 text-sm leading-7 text-white/68">
                        {productAnalysis.primaryCta}
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 text-sm text-white/34">
                    These details become the base layer for the workspace and later content generation.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
              <div>
                {wizardStep === 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onBackFromStep2) {
                        onBackFromStep2();
                        return;
                      }

                      setWizardStep(1);
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-white/40 transition hover:text-white"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                )}
              </div>

              <div>
                {wizardStep === 1 && (
                  <button
                    type="button"
                    disabled={!selectedSource}
                    onClick={() => {
                      if (onContinueFromStep1) {
                        onContinueFromStep1();
                        return;
                      }

                      setWizardStep(2);
                    }}
                    className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#111111] px-8 text-sm font-semibold text-white transition hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Continue
                  </button>
                )}

                {wizardStep === 2 && (
                  <button
                    type="button"
                    disabled={!terminalInput.trim() || isAnalysisRunning}
                    onClick={handleContinueStep2}
                    className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#111111] px-8 text-sm font-semibold text-white transition hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Continue
                  </button>
                )}

                {wizardStep === 4 && (
                  <button
                    type="button"
                    onClick={onComplete}
                    className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#111111] px-8 text-sm font-semibold text-white transition hover:bg-[#222222]"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
