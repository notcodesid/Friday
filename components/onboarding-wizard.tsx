"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  Github,
  Smartphone,
  Loader2,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type { ProductAnalysis } from "@/lib/agents/schemas";

type WizardStep = 1 | 2 | 3 | 4;

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
  onComplete: () => void;
};

const SOURCES = [
  {
    id: "website" as const,
    icon: Globe,
    title: "Website",
    description: "Import from URL",
    available: true,
  },
  {
    id: "github" as const,
    icon: Github,
    title: "GitHub Repo",
    description: "Code analyzed, never stored",
    available: false,
  },
  {
    id: "appstore" as const,
    icon: Smartphone,
    title: "App Store",
    description: "iOS or Android app",
    available: false,
  },
];

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i + 1 === current
              ? "w-6 bg-[#111111]"
              : i + 1 < current
                ? "w-1.5 bg-[#111111]/40"
                : "w-1.5 bg-[#d1d5db]"
          }`}
        />
      ))}
    </div>
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
  onComplete,
}: OnboardingWizardProps) {
  const { session, authEnabled, handleSignOut } = useAuth();
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [seenLabels, setSeenLabels] = useState<string[]>([]);
  const [submittedUrl, setSubmittedUrl] = useState<string>("");

  // Track analysis step labels for the stacked animation
  useEffect(() => {
    if (stepLabel && wizardStep === 3) {
      setSeenLabels((prev) => {
        if (prev[prev.length - 1] === stepLabel) return prev;
        return [...prev, stepLabel];
      });
    }
  }, [stepLabel, wizardStep]);

  // Auto-advance from step 3 to step 4 when product analysis is ready
  useEffect(() => {
    if (wizardStep === 3 && productAnalysis) {
      const timer = setTimeout(() => setWizardStep(4), 800);
      return () => clearTimeout(timer);
    }
  }, [wizardStep, productAnalysis]);

  // Ensure light background
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg", "#f8fafc");
  }, []);

  // Clean URL hash
  useEffect(() => {
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function handleContinueStep2() {
    if (!terminalInput.trim()) return;
    setSubmittedUrl(terminalInput.trim());
    setWizardStep(3);
    setSeenLabels([]);
    onSubmit();
  }

  function getDisplayName() {
    const metadata = session?.user.user_metadata ?? {};
    if (typeof metadata.full_name === "string" && metadata.full_name.trim()) return metadata.full_name.trim();
    if (typeof metadata.name === "string" && metadata.name.trim()) return metadata.name.trim();
    if (session?.user.email) return session.user.email.split("@")[0] ?? "Operator";
    return "Operator";
  }

  function getAvatarUrl() {
    const metadata = session?.user.user_metadata ?? {};
    const candidates = [metadata.avatar_url, metadata.picture, metadata.photo_url, metadata.image];
    return (candidates.find((c): c is string => typeof c === "string" && c.trim().length > 0)) ?? null;
  }

  const displayName = getDisplayName();
  const avatarUrl = getAvatarUrl();

  return (
    <div className="relative min-h-screen bg-[#f8fafc] text-[#111111] font-[Inter,sans-serif]">

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-xl">
              🦸
            </div>
            <div className="text-lg font-semibold tracking-[-0.05em] text-[#111111]">
              Friday<span className="text-[#2563eb]">.</span>
            </div>
          </div>

          <StepDots current={wizardStep} total={4} />

          <div className="flex items-center gap-3">
            {session && (
              <div className="flex items-center gap-3 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={displayName} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e5e7eb] text-xs font-semibold text-[#374151]">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-[#374151]">{displayName}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex min-h-[calc(100vh-73px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">

          {/* Step 1: Connect Source */}
          {wizardStep === 1 && (
            <div className="w-full max-w-[740px] animate-[fadeIn_0.3s_ease-out]">
              <h1 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-[-0.04em] text-[#111111]">
                Connect your app to get started
              </h1>
              <p className="mt-4 text-center text-base text-[#6b7280]">
                Choose a source and Friday will analyze it to build your marketing workspace.
              </p>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {SOURCES.map((source) => {
                  const Icon = source.icon;
                  const isSelected = selectedSource === source.id;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      disabled={!source.available}
                      onClick={() => setSelectedSource(source.id)}
                      className={`group relative flex flex-col items-center gap-4 rounded-[24px] border p-8 transition-all duration-200 ${
                        !source.available
                          ? "cursor-not-allowed border-[#e5e7eb] bg-[#f9fafb] opacity-40"
                          : isSelected
                            ? "border-[#2563eb] bg-[#eff6ff] shadow-sm"
                            : "border-[#e5e7eb] bg-white shadow-sm hover:border-[#d1d5db]"
                      }`}
                    >
                      <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ${
                        isSelected ? "bg-[#2563eb]/10 text-[#2563eb]" : "bg-[#f9fafb] text-[#6b7280]"
                      }`}>
                        <Icon size={36} strokeWidth={1.5} />
                      </div>
                      <div className="text-center">
                        <div className="text-base font-semibold text-[#111111]">{source.title}</div>
                        <div className="mt-1 text-sm text-[#9ca3af]">{source.description}</div>
                      </div>
                      {!source.available && (
                        <span className="absolute right-3 top-3 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2.5 py-1 text-xs font-medium text-[#9ca3af]">
                          Soon
                        </span>
                      )}
                      {source.available && source.id === "website" && !isSelected && (
                        <span className="rounded-full border border-[#2563eb]/30 bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#2563eb]">
                          Recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Enter URL */}
          {wizardStep === 2 && (
            <div className="w-full max-w-[520px] animate-[fadeIn_0.3s_ease-out]">
              <h1 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-[-0.04em] text-[#111111]">
                Enter Your Website
              </h1>

              <div className="mt-10">
                <input
                  ref={terminalInputRef}
                  type="text"
                  value={terminalInput}
                  onChange={(e) => onInputChange(e.target.value)}
                  autoFocus
                  placeholder="https://example.com"
                  className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 text-lg text-[#111111] shadow-sm outline-none transition placeholder:text-[#d1d5db] focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleContinueStep2();
                    }
                  }}
                />
                <p className="mt-3 text-center text-sm text-[#9ca3af]">
                  Please enter a valid domain (e.g., example.com)
                </p>
              </div>

              {visibleAuthError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-[#dc2626]">
                  {visibleAuthError}
                </div>
              )}

              <div className="mt-8 flex flex-wrap justify-center gap-3">
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
                      className="rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#6b7280] shadow-sm transition hover:border-[#d1d5db] hover:text-[#111111]"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Analyzing */}
          {wizardStep === 3 && (
            <div className="w-full max-w-[520px] animate-[fadeIn_0.3s_ease-out]">
              <h1 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-[-0.04em] text-[#111111]">
                Analyzing your website
              </h1>

              <div className="mt-6 flex justify-center">
                <span className="rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151]">
                  {submittedUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "") || terminalInput}
                </span>
              </div>

              {/* Stacked cards animation */}
              <div className="relative mt-10 flex justify-center">
                <div className="relative w-full max-w-[420px]">
                  {seenLabels.map((label, idx) => {
                    const distFromTop = seenLabels.length - 1 - idx;
                    const isActive = idx === seenLabels.length - 1;
                    return (
                      <div
                        key={label}
                        className="transition-all duration-500 ease-out"
                        style={{
                          transform: `translateY(${distFromTop * -8}px) scale(${1 - distFromTop * 0.03})`,
                          opacity: isActive ? 1 : Math.max(0.1, 0.4 - distFromTop * 0.15),
                          position: distFromTop === 0 ? "relative" : "absolute",
                          bottom: distFromTop === 0 ? undefined : 0,
                          left: 0,
                          right: 0,
                          zIndex: idx,
                        }}
                      >
                        <div className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 shadow-sm">
                          {isActive ? (
                            <div className="h-3 w-3 rounded-full bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.3)]" />
                          ) : (
                            <Check size={14} className="text-[#d1d5db]" />
                          )}
                          <span className={`text-sm font-medium ${isActive ? "text-[#111111]" : "text-[#9ca3af]"}`}>
                            {label}
                          </span>
                          {isActive && (
                            <Loader2 size={14} className="ml-auto animate-spin text-[#9ca3af]" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {seenLabels.length === 0 && (
                    <div className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 shadow-sm">
                      <Loader2 size={14} className="animate-spin text-[#9ca3af]" />
                      <span className="text-sm font-medium text-[#6b7280]">Starting analysis...</span>
                    </div>
                  )}
                </div>
              </div>

              {analysisErrors.length > 0 && (
                <div className="mt-6 text-center">
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                    {analysisErrors[analysisErrors.length - 1].message}
                  </div>
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="mt-4 text-sm font-medium text-[#2563eb] transition hover:text-[#1d4ed8]"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {wizardStep === 4 && productAnalysis && (
            <div className="w-full max-w-[600px] animate-[fadeIn_0.3s_ease-out]">
              <h1 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-[-0.04em] text-[#111111]">
                Review App Details
              </h1>

              <div className="mt-10 rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#6b7280]">App Name</label>
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-base text-[#111111]">
                      {productAnalysis.brandName}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#6b7280]">App Description</label>
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-base leading-relaxed text-[#374151]">
                      {productAnalysis.positioning}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#6b7280]">Tagline</label>
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-base text-[#111111]">
                      {productAnalysis.oneLiner}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#6b7280]">Target Audience</label>
                      <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-sm text-[#374151]">
                        {productAnalysis.targetAudience[0] ?? "General"}
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#6b7280]">Brand Voice</label>
                      <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-sm text-[#374151]">
                        {productAnalysis.brandVoice[0] ?? "Professional"}
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#6b7280]">Primary CTA</label>
                      <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-sm text-[#374151]">
                        {productAnalysis.primaryCta}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-center text-sm text-[#9ca3af]">
                These details will be used for content generation.
              </p>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="relative z-10 border-t border-[#e5e7eb] bg-white px-6 py-5">
          <div className="mx-auto flex max-w-[740px] items-center justify-between">
            <div>
              {wizardStep === 2 && (
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="flex items-center gap-2 text-sm font-medium text-[#9ca3af] transition hover:text-[#111111]"
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
                  onClick={() => setWizardStep(2)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#111111] px-8 text-sm font-semibold text-white transition hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Continue
                </button>
              )}

              {wizardStep === 2 && (
                <button
                  type="button"
                  disabled={!terminalInput.trim() || isAnalysisRunning}
                  onClick={handleContinueStep2}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#111111] px-8 text-sm font-semibold text-white transition hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Continue
                </button>
              )}

              {wizardStep === 4 && (
                <button
                  type="button"
                  onClick={onComplete}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#111111] px-8 text-sm font-semibold text-white transition hover:bg-[#222222]"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
