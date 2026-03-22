import { z } from "zod";

import type { AgentDefinition, ToolDefinition } from "@/lib/agents/core/runner";
import { runAgent } from "@/lib/agents/core/runner";
import { distributionPlanSchema, type AgentRunInput } from "@/lib/agents/schemas";
import { hasAI } from "@/lib/env";
import { inspectWebsite } from "@/lib/site/inspect";

const inspectSiteTool: ToolDefinition = {
  name: "inspect_site",
  description:
    "Fetch the target website and extract homepage messaging, supporting pages, CTA language, and evidence snippets.",
  input_schema: {
    type: "object",
    properties: {
      siteUrl: {
        type: "string",
        description: "The website URL to inspect",
      },
    },
    required: ["siteUrl"],
  },
  execute: async ({ siteUrl }) => {
    const result = await inspectWebsite(siteUrl as string);
    return JSON.stringify(result);
  },
};

const distributionAgent: AgentDefinition = {
  name: "Content Distribution Agent",
  instructions: `You are Friday's first distribution agent.

Your job is to inspect a product website and produce a practical distribution plan that can be executed immediately.

Rules:
- Always call inspect_site before producing an answer.
- Ground every recommendation in the website evidence returned by the tool.
- Do not invent product claims, customers, metrics, or features that are not supported by the tool output.
- If something is inferred rather than explicit, keep the wording careful and commercially useful.
- Prefer sharp, direct positioning over generic marketing language.
- Focus on channels where lean teams can ship consistently: LinkedIn, X, Email, and Blog.
- Drafts should sound like a serious founder/operator, not a hype account.
- Return only valid JSON matching the required schema. No markdown, no extra text — just the JSON object.`,
  tools: [inspectSiteTool],
  temperature: 0.7,
};

function buildPrompt(input: AgentRunInput) {
  const notes = input.notes?.trim();

  return [
    `Create a distribution plan for ${input.siteUrl}.`,
    `Channels: ${input.channels.join(", ")}.`,
    notes ? `Operator notes: ${notes}` : undefined,
    "Output requirements:",
    "- infer the product positioning, target user, pains, and CTA from the site",
    "- create 3 to 5 content pillars",
    `- include channel plans only for: ${input.channels.join(", ")}`,
    "- include at least one usable draft per selected channel where possible",
    "- include 2 to 4 experiments and 3 to 6 next actions",
    "- Return ONLY a valid JSON object matching this schema (no markdown fences, no extra text):",
    JSON.stringify(distributionPlanSchema.shape, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runContentDistributionAgent(input: AgentRunInput) {
  if (!hasAI()) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Add it to your environment before running the agent.",
    );
  }

  const result = await runAgent(distributionAgent, buildPrompt(input));

  if (!result.output) {
    throw new Error("The agent finished without returning output.");
  }

  // Try to parse the JSON from the output
  const jsonMatch = result.output.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("The agent did not return valid JSON output.");
  }

  return distributionPlanSchema.parse(JSON.parse(jsonMatch[0]));
}
