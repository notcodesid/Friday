import {
  query,
  type Options,
  type AgentDefinition as SDKAgentDefinition,
} from "@anthropic-ai/claude-agent-sdk";

import type { FridayContext } from "@/lib/agents/core/context";
import { buildCMOInstructions } from "@/lib/agents/cmo";
import { buildContentStrategistInstructions } from "@/lib/agents/content-strategist";
import { buildCompetitorAnalystInstructions } from "@/lib/agents/competitor-analyst";
import { buildReggitInstructions } from "@/lib/agents/reggit";
import { env } from "@/lib/env";

export type FridayAgentId = "cmo" | "content-strategist" | "competitor-analyst" | "reggit";

function buildAgents(
  context: FridayContext,
): Record<string, SDKAgentDefinition> {
  return {
    cmo: {
      description:
        "AI marketing operator — understands marketing needs, provides strategy, and coordinates research-to-publishing execution.",
      prompt: buildCMOInstructions(context),
      tools: ["WebSearch", "WebFetch", "Agent"],
    },
    "content-strategist": {
      description:
        "Content creation specialist — creates blog posts, social media copy, email campaigns, and poster-led social packages using real web research.",
      prompt: buildContentStrategistInstructions(context),
      tools: ["WebSearch", "WebFetch"],
    },
    "competitor-analyst": {
      description:
        "Competitive intelligence specialist — analyzes competitor websites, positioning, content strategy, and market gaps.",
      prompt: buildCompetitorAnalystInstructions(context),
      tools: ["WebSearch", "WebFetch"],
    },
    reggit: {
      description:
        "Reddit marketing and community intelligence specialist — finds subreddits, crafts Reddit-native content, and plans community engagement strategies.",
      prompt: buildReggitInstructions(context),
      tools: ["WebSearch", "WebFetch"],
    },
  };
}

/**
 * Run a Friday agent chat with streaming output.
 * Returns a ReadableStream that emits text chunks as the agent responds.
 */
export function runFridayChat(
  message: string,
  agentId: FridayAgentId = "cmo",
  context: FridayContext = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const agents = buildAgents(context);

        const options: Options = {
          model: env.model,
          agent: agentId,
          agents,
          tools: ["WebSearch", "WebFetch", "Agent"],
          allowedTools: ["WebSearch", "WebFetch", "Agent"],
          includePartialMessages: true,
          persistSession: false,
          thinking: { type: "disabled" },
        };

        const q = query({ prompt: message, options });

        for await (const msg of q) {
          if (msg.type === "stream_event") {
            const evt = msg.event;
            if (evt.type === "content_block_delta") {
              const delta = (evt as unknown as { delta?: { type: string; text?: string } }).delta;
              if (delta?.type === "text_delta" && typeof delta.text === "string") {
                controller.enqueue(encoder.encode(delta.text));
              }
            }
          }
        }

        controller.close();
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Agent execution failed";
        controller.enqueue(encoder.encode(`\nError: ${errMsg}`));
        controller.close();
      }
    },
  });
}
