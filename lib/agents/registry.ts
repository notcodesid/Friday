import type { Channel } from "@/lib/agents/schemas";

export const defaultChannels: Channel[] = ["LinkedIn", "X", "Email", "Blog"];

export const agentRegistry = [
  {
    id: "content-distribution",
    name: "Content Distribution Agent",
    subtitle: "Turns a product website into a channel plan, draft copy, and publish-ready execution ideas.",
    defaultGoal:
      "Find the most credible positioning angles and convert them into practical campaign output.",
  },
  {
    id: "cmo",
    name: "Friday CMO",
    subtitle:
      "AI marketing operator — handles strategy, content direction, and publishing handoff.",
    defaultGoal:
      "Understand marketing needs and coordinate specialist agents from research to OpenClock-ready output.",
  },
  {
    id: "content-strategist",
    name: "Content Strategist",
    subtitle:
      "Creates blog posts, social media copy, email campaigns, competitor reads, and publish-ready social packages.",
    defaultGoal:
      "Produce research-backed, brand-aligned content that is ready to publish.",
  },
  {
    id: "reggit",
    name: "Reggit",
    subtitle:
      "Reddit marketing specialist — finds target subreddits, crafts community-native content, and builds authentic engagement strategies.",
    defaultGoal:
      "Research relevant subreddits and create a Reddit growth strategy with ready-to-post content.",
  },
] as const;

export type AgentId = (typeof agentRegistry)[number]["id"];
