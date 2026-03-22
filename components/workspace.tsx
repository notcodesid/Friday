"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Instagram,
  Linkedin,
  Loader2,
  FileText,
  Twitter,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type { ProductAnalysis, CompetitorAnalysis, CompetitiveInsights, BrandVoiceDoc } from "@/lib/agents/schemas";
import type { FridayContext } from "@/lib/agents/core/context";

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

type SocialCopy = {
  instagram: string;
  x: string;
  linkedin: string;
  raw: string;
};

type WorkspaceProps = {
  siteUrl: string;
  productAnalysis: ProductAnalysis;
  competitors: Array<{ name: string; domain: string; positioning?: string; strengths?: string[]; weaknesses?: string[] }>;
  competitorAnalyses: CompetitorAnalysis[];
  insights: CompetitiveInsights | null;
  brandVoiceDoc: BrandVoiceDoc | null;
  brandContext: FridayContext;
};

function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5 text-xs font-medium text-[#6b7280] transition hover:border-[#d1d5db] hover:text-[#111111]"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}

export function Workspace({
  siteUrl,
  productAnalysis,
  competitors,
  competitorAnalyses,
  insights,
  brandVoiceDoc,
  brandContext,
}: WorkspaceProps) {
  const { session } = useAuth();
  const [generatedAds, setGeneratedAds] = useState<GeneratedAdImage[]>([]);
  const [isGeneratingAds, setIsGeneratingAds] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [socialCopy, setSocialCopy] = useState<SocialCopy | null>(null);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const domain = (() => {
    try { return new URL(siteUrl).hostname.replace(/^www\./, ""); } catch { return siteUrl; }
  })();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  // Auto-generate ads on mount
  const generateAds = useCallback(async () => {
    if (isGeneratingAds) return;
    setIsGeneratingAds(true);
    setAdError(null);

    const formats = ["instagram-post", "x-post", "instagram-story"] as const;
    const results: GeneratedAdImage[] = [];

    for (const format of formats) {
      try {
        const res = await fetch("/api/brand-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ siteUrl, format }),
        });
        if (res.ok) {
          const data = await res.json();
          results.push(data);
          setGeneratedAds([...results]);
        }
      } catch {
        // Continue with other formats
      }
    }

    if (results.length === 0) {
      setAdError("Failed to generate graphics. Check your Gemini API key.");
    }
    setIsGeneratingAds(false);
  }, [siteUrl, session?.access_token]);

  // Auto-generate social copy on mount
  const generateSocialCopy = useCallback(async () => {
    if (isGeneratingCopy) return;
    setIsGeneratingCopy(true);
    setCopyError(null);

    try {
      const res = await fetch("/api/social-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ brandContext }),
      });

      if (!res.ok) {
        const err = await res.json();
        setCopyError(err.error ?? "Failed to generate copy.");
        return;
      }

      const data = await res.json();
      setSocialCopy(data);
    } catch {
      setCopyError("Failed to generate social copy.");
    } finally {
      setIsGeneratingCopy(false);
    }
  }, [brandContext, session?.access_token]);

  useEffect(() => {
    generateAds();
    generateSocialCopy();
  }, []);

  // Download report
  async function downloadReport() {
    setIsDownloading(true);
    try {
      const reportData = {
        brandName: productAnalysis.brandName,
        siteUrl,
        oneLiner: productAnalysis.oneLiner,
        positioning: productAnalysis.positioning,
        targetAudience: productAnalysis.targetAudience,
        painPoints: productAnalysis.painPoints,
        differentiators: productAnalysis.differentiators,
        primaryCta: productAnalysis.primaryCta,
        brandVoice: productAnalysis.brandVoice,
        competitors: competitors.map((c) => {
          const analysis = competitorAnalyses.find((a) => a.domain === c.domain);
          return {
            name: c.name,
            domain: c.domain,
            positioning: analysis?.positioning ?? c.positioning,
            strengths: analysis?.strengths,
            weaknesses: analysis?.weaknesses,
          };
        }),
        insights,
        voiceDoc: brandVoiceDoc
          ? {
              identity: brandVoiceDoc.identity,
              principles: brandVoiceDoc.principles.map((p) => ({
                label: p.label,
                explanation: p.explanation,
              })),
              dos: brandVoiceDoc.dos,
              donts: brandVoiceDoc.donts,
            }
          : null,
      };

      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(reportData),
      });

      if (!res.ok) throw new Error("Failed to generate report");

      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.addEventListener("load", () => {
          URL.revokeObjectURL(url);
        });
      }
    } catch {
      // Silently fail
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#f8fafc] text-[#111111] font-[Inter,sans-serif]">

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-xl">
              🦸
            </div>
            <div>
              <div className="text-lg font-semibold tracking-[-0.05em] text-[#111111]">
                Friday<span className="text-[#2563eb]">.</span>
              </div>
              <div className="text-xs text-[#9ca3af]">{domain}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadReport}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#222222] disabled:opacity-50"
          >
            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download Report
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-[1360px] px-6 py-8 md:px-10 md:py-12">

        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.04em] text-[#111111]">
            {productAnalysis.brandName}
          </h1>
          <p className="mt-2 max-w-[60ch] text-lg text-[#6b7280]">
            {productAnalysis.oneLiner}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {productAnalysis.targetAudience.map((a) => (
              <span key={a} className="rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1 text-xs font-medium text-[#6b7280]">
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* Graphics Section */}
        <section className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f9fafb] text-[#2563eb]">
                <ImageIcon size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Generated Graphics</h2>
                <p className="text-sm text-[#9ca3af]">Brand ads for your social channels</p>
              </div>
            </div>
            {!isGeneratingAds && (
              <button
                type="button"
                onClick={generateAds}
                className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#6b7280] transition hover:border-[#d1d5db] hover:text-[#111111]"
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
            )}
          </div>

          {isGeneratingAds && generatedAds.length === 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-8">
              <Loader2 size={18} className="animate-spin text-[#2563eb]" />
              <span className="text-sm text-[#6b7280]">Generating brand graphics...</span>
            </div>
          )}

          {adError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#dc2626]">
              {adError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {generatedAds.map((ad, idx) => (
              <div key={idx} className="group overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${ad.mimeType};base64,${ad.imageBase64}`}
                  alt={`${ad.format} ad`}
                  className="w-full"
                />
                <div className="flex items-center justify-between p-3">
                  <span className="text-xs font-medium text-[#9ca3af]">{ad.format.replace("-", " ")}</span>
                  <a
                    href={`data:${ad.mimeType};base64,${ad.imageBase64}`}
                    download={`${productAnalysis.brandName}_${ad.format}.png`}
                    className="flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5 text-xs font-medium text-[#6b7280] transition hover:text-[#111111]"
                  >
                    <Download size={12} />
                    Save
                  </a>
                </div>
              </div>
            ))}
            {isGeneratingAds && generatedAds.length > 0 && generatedAds.length < 3 && (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-[#e5e7eb] bg-white shadow-sm p-12">
                <Loader2 size={18} className="animate-spin text-[#d1d5db]" />
              </div>
            )}
          </div>
        </section>

        {/* Social Copy Section */}
        <section className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f9fafb] text-[#2563eb]">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Social Copy</h2>
                <p className="text-sm text-[#9ca3af]">Ready-to-post content for your channels</p>
              </div>
            </div>
            {!isGeneratingCopy && socialCopy && (
              <button
                type="button"
                onClick={generateSocialCopy}
                className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#6b7280] transition hover:border-[#d1d5db] hover:text-[#111111]"
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
            )}
          </div>

          {isGeneratingCopy && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-8">
              <Loader2 size={18} className="animate-spin text-[#2563eb]" />
              <span className="text-sm text-[#6b7280]">Generating social copy...</span>
            </div>
          )}

          {copyError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#dc2626]">
              {copyError}
            </div>
          )}

          {socialCopy && (
            <div className="grid gap-4 md:grid-cols-3">
              {/* Instagram */}
              <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Instagram size={16} className="text-pink-400" />
                    <span className="text-sm font-semibold text-[#111111]">Instagram</span>
                  </div>
                  <CopyButton text={socialCopy.instagram} />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4b5563]">
                  {socialCopy.instagram || "No caption generated."}
                </p>
              </div>

              {/* X / Twitter */}
              <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Twitter size={16} className="text-blue-400" />
                    <span className="text-sm font-semibold text-[#111111]">X (Twitter)</span>
                  </div>
                  <CopyButton text={socialCopy.x} />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4b5563]">
                  {socialCopy.x || "No tweet generated."}
                </p>
                <div className="mt-3 text-xs text-[#d1d5db]">
                  {socialCopy.x.length}/280 characters
                </div>
              </div>

              {/* LinkedIn */}
              <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Linkedin size={16} className="text-blue-500" />
                    <span className="text-sm font-semibold text-[#111111]">LinkedIn</span>
                  </div>
                  <CopyButton text={socialCopy.linkedin} />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4b5563]">
                  {socialCopy.linkedin || "No post generated."}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Quick Stats */}
        <section className="mb-12">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Positioning</div>
              <p className="mt-3 text-sm leading-relaxed text-[#4b5563]">{productAnalysis.positioning}</p>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Competitors</div>
              <div className="mt-3 text-2xl font-semibold text-[#111111]">{competitors.length}</div>
              <div className="mt-1 text-sm text-[#9ca3af]">tracked in landscape</div>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Opportunities</div>
              <div className="mt-3 text-2xl font-semibold text-[#111111]">{insights?.opportunities.length ?? 0}</div>
              <div className="mt-1 text-sm text-[#9ca3af]">campaign angles found</div>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Brand Voice</div>
              <div className="mt-3 text-sm leading-relaxed text-[#4b5563]">
                {brandVoiceDoc?.identity ?? productAnalysis.brandVoice.join(", ")}
              </div>
            </div>
          </div>
        </section>

        {/* Differentiators */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold tracking-[-0.03em] text-[#111111]">Key Differentiators</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {productAnalysis.differentiators.map((d, i) => (
              <div key={i} className="rounded-xl border border-[#e5e7eb] bg-white shadow-sm px-5 py-4">
                <p className="text-sm text-[#4b5563]">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#f0f0f0] pt-6 pb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[#9ca3af]">
              <span className="text-lg font-semibold tracking-[-0.05em]">
                Friday<span className="text-[#2563eb]">.</span>
              </span>
              <span className="text-xs">Marketing Intelligence</span>
            </div>
            <button
              type="button"
              onClick={downloadReport}
              disabled={isDownloading}
              className="flex items-center gap-2 text-sm font-medium text-[#9ca3af] transition hover:text-[#111111]"
            >
              <Download size={14} />
              Download full report
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
