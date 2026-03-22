import { z } from "zod";

export const channelSchema = z.enum(["LinkedIn", "X", "Email", "Blog"]);

export const agentRunInputSchema = z.object({
  siteUrl: z.string().url(),
  channels: z.array(channelSchema).min(1).max(4),
  notes: z.string().trim().max(1200).optional(),
});

export const siteContextPageSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  headings: z.array(z.string()).max(16),
  paragraphs: z.array(z.string()).max(24),
});

export const siteContextSchema = z.object({
  siteUrl: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  ctas: z.array(z.string()).max(20),
  keyPages: z.array(siteContextPageSchema).max(8),
  evidenceSnippets: z.array(z.string()).max(40),
});

export const contentDraftSchema = z.object({
  channel: channelSchema,
  format: z.string(),
  title: z.string(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  sourcePillar: z.string(),
});

export const competitorRecordSchema = z.object({
  name: z.string(),
  domain: z.string(),
  logo: z.string().url().optional(),
  reason: z.string(),
  positioning: z.string().optional(),
});

export const competitorDiscoverySchema = z.object({
  summary: z.string().optional(),
  competitors: z.array(competitorRecordSchema).max(8),
});

export const distributionPlanSchema = z.object({
  summary: z.string(),
  siteProfile: z.object({
    brandName: z.string(),
    oneLiner: z.string(),
    targetAudience: z.string(),
    painPoints: z.array(z.string()).max(6),
    differentiators: z.array(z.string()).max(6),
    primaryCta: z.string(),
    brandVoice: z.array(z.string()).max(4),
    likelyCompetitors: z.array(z.string()).max(6),
    proofPoints: z.array(z.string()).max(6),
  }),
  contentPillars: z
    .array(
      z.object({
        name: z.string(),
        rationale: z.string(),
        evidence: z.array(z.string()).max(4),
        sampleAngles: z.array(z.string()).max(4),
      }),
    )
    .min(3)
    .max(5),
  channelPlans: z
    .array(
      z.object({
        channel: channelSchema,
        whyItFits: z.string(),
        cadence: z.string(),
        contentFormats: z.array(z.string()).max(5),
        firstTopics: z.array(z.string()).max(4),
      }),
    )
    .min(1)
    .max(4),
  drafts: z.array(contentDraftSchema).min(2).max(8),
  experiments: z
    .array(
      z.object({
        name: z.string(),
        hypothesis: z.string(),
        successMetric: z.string(),
      }),
    )
    .min(2)
    .max(4),
  nextActions: z.array(z.string()).min(3).max(6),
});

/* ------------------------------------------------------------------ */
/*  Analysis pipeline schemas                                          */
/* ------------------------------------------------------------------ */

export const productAnalysisSchema = z.object({
  brandName: z.string(),
  oneLiner: z.string(),
  positioning: z.string(),
  targetAudience: z.array(z.string()).max(4),
  painPoints: z.array(z.string()).max(6),
  differentiators: z.array(z.string()).max(6),
  primaryCta: z.string(),
  brandVoice: z.array(z.string()).max(4),
  techStack: z.array(z.string()).max(6),
  socialLinks: z
    .array(z.object({ platform: z.string(), url: z.string() }))
    .max(8),
});

export const competitorAnalysisSchema = z.object({
  name: z.string(),
  domain: z.string(),
  positioning: z.string(),
  targetAudience: z.string(),
  strengths: z.array(z.string()).max(6),
  weaknesses: z.array(z.string()).max(6),
  contentStrategy: z.object({
    channels: z.array(z.string()).max(6),
    themes: z.array(z.string()).max(6),
    tone: z.string(),
    cadence: z.string().optional(),
  }),
  pricingModel: z.string().optional(),
  techStack: z.array(z.string()).max(6),
});

export const competitiveInsightsSchema = z.object({
  opportunities: z.array(z.string()).max(6),
  gaps: z.array(z.string()).max(6),
  recommendations: z.array(z.string()).max(6),
  positioningAdvice: z.string(),
});

/* ------------------------------------------------------------------ */
/*  Brand Voice document schema                                        */
/* ------------------------------------------------------------------ */

export const brandVoicePrincipleSchema = z.object({
  label: z.string().describe("Short name, e.g. 'Direct over clever'"),
  explanation: z.string().describe("Why this matters for the brand"),
  example: z.string().describe("A sample sentence written in this principle"),
});

export const brandVoiceToneContextSchema = z.object({
  context: z.string().describe("Where this tone applies, e.g. 'Onboarding emails'"),
  tone: z.string().describe("How the voice shifts here"),
  example: z.string().describe("A sample line in this tone"),
});

export const brandVoiceRewriteSchema = z.object({
  generic: z.string().describe("A generic marketing line"),
  rewritten: z.string().describe("The same line rewritten in the brand voice"),
});

export const brandVoiceDocSchema = z.object({
  identity: z.string().describe("One-line voice identity, e.g. 'A sharp friend who won't sugarcoat it'"),
  principles: z.array(brandVoicePrincipleSchema).min(3).max(4),
  toneSpectrum: z.array(brandVoiceToneContextSchema).min(3).max(5),
  dos: z.array(z.string()).min(3).max(6),
  donts: z.array(z.string()).min(3).max(6),
  rewrites: z.array(brandVoiceRewriteSchema).min(2).max(3),
});

export type BrandVoiceDoc = z.infer<typeof brandVoiceDocSchema>;

/* ------------------------------------------------------------------ */
/*  Inferred types                                                     */
/* ------------------------------------------------------------------ */

export type AgentRunInput = z.infer<typeof agentRunInputSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type CompetitorDiscovery = z.infer<typeof competitorDiscoverySchema>;
export type CompetitorRecord = z.infer<typeof competitorRecordSchema>;
export type SiteContext = z.infer<typeof siteContextSchema>;
export type DistributionPlan = z.infer<typeof distributionPlanSchema>;
export type ProductAnalysis = z.infer<typeof productAnalysisSchema>;
export type CompetitorAnalysis = z.infer<typeof competitorAnalysisSchema>;
export type CompetitiveInsights = z.infer<typeof competitiveInsightsSchema>;
