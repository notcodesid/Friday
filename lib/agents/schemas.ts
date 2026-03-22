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

export type AgentRunInput = z.infer<typeof agentRunInputSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type SiteContext = z.infer<typeof siteContextSchema>;
export type DistributionPlan = z.infer<typeof distributionPlanSchema>;
