import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";

export const runtime = "nodejs";

type ReportData = {
  brandName: string;
  siteUrl: string;
  oneLiner: string;
  positioning: string;
  targetAudience: string[];
  painPoints: string[];
  differentiators: string[];
  primaryCta: string;
  brandVoice: string[];
  competitors: Array<{
    name: string;
    domain: string;
    positioning?: string;
    strengths?: string[];
    weaknesses?: string[];
  }>;
  insights: {
    opportunities: string[];
    gaps: string[];
    recommendations: string[];
    positioningAdvice: string;
  } | null;
  voiceDoc: {
    identity: string;
    principles: Array<{ label: string; explanation: string }>;
    dos: string[];
    donts: string[];
  } | null;
};

export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let data: ReportData;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const html = buildReportHtml(data);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${data.brandName.replace(/[^a-zA-Z0-9]/g, "_")}_report.html"`,
    },
  });
}

function buildReportHtml(data: ReportData): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const listItems = (items: string[]) =>
    items.map((item) => `<li>${esc(item)}</li>`).join("\n");

  const competitorRows = data.competitors
    .map(
      (c) => `
      <div class="competitor-card">
        <h4>${esc(c.name)}</h4>
        <p class="domain">${esc(c.domain)}</p>
        ${c.positioning ? `<p>${esc(c.positioning)}</p>` : ""}
        ${c.strengths?.length ? `<div class="sub"><strong>Strengths:</strong><ul>${listItems(c.strengths)}</ul></div>` : ""}
        ${c.weaknesses?.length ? `<div class="sub"><strong>Weaknesses:</strong><ul>${listItems(c.weaknesses)}</ul></div>` : ""}
      </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(data.brandName)} — Marketing Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #fff; color: #1a1a1a; line-height: 1.7; padding: 48px; max-width: 900px; margin: 0 auto; }
  @media print { body { padding: 24px; } .no-print { display: none; } }
  h1 { font-size: 2rem; font-weight: 700; letter-spacing: -0.03em; margin-bottom: 4px; }
  h2 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; margin-top: 40px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #111; }
  h3 { font-size: 1rem; font-weight: 600; margin-top: 20px; margin-bottom: 8px; }
  h4 { font-size: 0.95rem; font-weight: 600; }
  p { margin-bottom: 12px; font-size: 0.92rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 32px; }
  .tag { display: inline-block; background: #f3f4f6; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; font-weight: 500; margin: 2px 4px 2px 0; }
  .tag-accent { background: #111; color: #fff; }
  ul { padding-left: 20px; margin-bottom: 12px; }
  li { font-size: 0.9rem; margin-bottom: 4px; }
  .section { margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .competitor-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .competitor-card .domain { color: #888; font-size: 0.82rem; margin-bottom: 8px; }
  .sub { margin-top: 8px; font-size: 0.85rem; }
  .sub ul { margin-top: 4px; }
  .principle { background: #f9fafb; border-radius: 10px; padding: 14px; margin-bottom: 10px; }
  .principle strong { font-size: 0.9rem; }
  .principle p { font-size: 0.85rem; color: #555; margin-top: 4px; margin-bottom: 0; }
  .quote { font-style: italic; font-size: 1.05rem; color: #333; border-left: 3px solid #111; padding-left: 16px; margin: 12px 0 20px; }
  .do-dont { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .do-list li::marker { content: "✓ "; color: #059669; }
  .dont-list li::marker { content: "✗ "; color: #dc2626; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #999; font-size: 0.78rem; text-align: center; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #111; color: #fff; border: none; padding: 12px 24px; border-radius: 999px; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .print-btn:hover { background: #333; }
</style>
</head>
<body>

<h1>${esc(data.brandName)}</h1>
<p class="meta">${esc(data.siteUrl)} · Marketing Intelligence Report</p>

<div class="section">
  <p><strong>${esc(data.oneLiner)}</strong></p>
  <p>${esc(data.positioning)}</p>
</div>

<h2>Positioning & Audience</h2>
<div class="section">
  <h3>Target Audience</h3>
  <div>${data.targetAudience.map((a) => `<span class="tag">${esc(a)}</span>`).join(" ")}</div>

  <h3>Pain Points</h3>
  <ul>${listItems(data.painPoints)}</ul>

  <h3>Differentiators</h3>
  <ul>${listItems(data.differentiators)}</ul>

  <h3>Primary CTA</h3>
  <p><span class="tag tag-accent">${esc(data.primaryCta)}</span></p>
</div>

${
  data.competitors.length > 0
    ? `<h2>Competitors & Comparisons</h2>
<div class="section">${competitorRows}</div>`
    : ""
}

${
  data.insights
    ? `<h2>Campaign Angles & Next Moves</h2>
<div class="section">
  <h3>Opportunities</h3>
  <ul>${listItems(data.insights.opportunities)}</ul>
  <h3>Market Gaps</h3>
  <ul>${listItems(data.insights.gaps)}</ul>
  <h3>Recommendations</h3>
  <ul>${listItems(data.insights.recommendations)}</ul>
  <h3>Positioning Advice</h3>
  <p>${esc(data.insights.positioningAdvice)}</p>
</div>`
    : ""
}

${
  data.voiceDoc
    ? `<h2>Brand Voice</h2>
<div class="section">
  <div class="quote">${esc(data.voiceDoc.identity)}</div>
  ${data.voiceDoc.principles.map((p) => `<div class="principle"><strong>${esc(p.label)}</strong><p>${esc(p.explanation)}</p></div>`).join("\n")}
  <div class="do-dont">
    <div>
      <h3>Do</h3>
      <ul class="do-list">${listItems(data.voiceDoc.dos)}</ul>
    </div>
    <div>
      <h3>Don't</h3>
      <ul class="dont-list">${listItems(data.voiceDoc.donts)}</ul>
    </div>
  </div>
</div>`
    : ""
}

${
  data.brandVoice.length > 0
    ? `<h2>Brand Voice Signals</h2>
<div>${data.brandVoice.map((v) => `<span class="tag">${esc(v)}</span>`).join(" ")}</div>`
    : ""
}

<div class="footer">
  Generated by Friday · ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
</div>

<button class="print-btn no-print" onclick="window.print()">Save as PDF</button>

</body>
</html>`;
}
