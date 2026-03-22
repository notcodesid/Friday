import type { Channel } from "@/lib/agents/schemas";

export const defaultChannels: Channel[] = ["LinkedIn", "X", "Email", "Blog"];

export const agentRegistry = [
  {
    id: "content-distribution",
    name: "Content Distribution Agent",
    subtitle: "Turns a product website into a real channel plan and ready-to-edit drafts.",
    defaultGoal:
      "Find the most credible positioning angles and convert them into practical distribution output.",
  },
  {
    id: "cmo",
    name: "Friday CMO",
    subtitle:
      "AI Chief Marketing Officer — delegates to specialist agents for content, SEO, social, and more.",
    defaultGoal:
      "Understand marketing needs and coordinate specialist agents to execute.",
  },
  {
    id: "content-strategist",
    name: "Content Strategist",
    subtitle:
      "Creates blog posts, social media copy, email campaigns, analyses competitors, and rewrites content.",
    defaultGoal:
      "Produce high-quality, brand-aligned marketing content across all channels.",
  },
] as const;

export type AgentId = (typeof agentRegistry)[number]["id"];
