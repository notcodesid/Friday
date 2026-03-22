import Anthropic from "@anthropic-ai/sdk";

import type { FridayContext } from "@/lib/agents/core/context";
import { getAnthropicClient } from "@/lib/agents/core/client";
import { env } from "@/lib/env";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool["input_schema"];
  execute: (
    input: Record<string, unknown>,
    context: FridayContext,
  ) => Promise<string>;
};

export type AgentDefinition = {
  name: string;
  instructions: string | ((context: FridayContext) => string);
  tools?: ToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Other agents this agent can hand off to */
  handoffs?: AgentDefinition[];
};

export type RunResult = {
  output: string;
  agentName: string;
  toolCalls: Array<{ tool: string; input: unknown; output: string }>;
};

/* ------------------------------------------------------------------ */
/*  Handoff tool generator                                             */
/* ------------------------------------------------------------------ */

function makeHandoffTools(
  handoffs: AgentDefinition[],
): Anthropic.Tool[] {
  return handoffs.map((agent) => ({
    name: `handoff_to_${agent.name.toLowerCase().replace(/\s+/g, "_")}`,
    description: `Hand off the conversation to the ${agent.name} agent. Use this when the user's request falls within this agent's specialty.`,
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "Why you are handing off to this agent",
        },
      },
      required: ["reason"],
    },
  }));
}

/* ------------------------------------------------------------------ */
/*  Agent runner                                                       */
/* ------------------------------------------------------------------ */

export async function runAgent(
  agent: AgentDefinition,
  userMessage: string,
  context: FridayContext = {},
  maxTurns = 12,
): Promise<RunResult> {
  const client = getAnthropicClient();
  const toolCalls: RunResult["toolCalls"] = [];

  // Resolve instructions
  const systemPrompt =
    typeof agent.instructions === "function"
      ? agent.instructions(context)
      : agent.instructions;

  // Build tool list for Anthropic
  const anthropicTools: Anthropic.Tool[] = (agent.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  // Add handoff tools
  if (agent.handoffs?.length) {
    anthropicTools.push(...makeHandoffTools(agent.handoffs));
  }

  // Conversation messages
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let currentAgent = agent;
  let currentSystemPrompt = systemPrompt;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: currentAgent.model ?? env.model,
      max_tokens: currentAgent.maxTokens ?? 4096,
      temperature: currentAgent.temperature ?? 0.7,
      system: currentSystemPrompt,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      messages,
    });

    // If the model just returns text (no tool use), we're done
    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      return {
        output: textBlocks.map((b) => b.text).join("\n"),
        agentName: currentAgent.name,
        toolCalls,
      };
    }

    // Handle tool use
    if (response.stop_reason === "tool_use") {
      // Add the assistant's response to messages
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        // Check if this is a handoff
        if (block.name.startsWith("handoff_to_") && currentAgent.handoffs) {
          const targetName = block.name
            .replace("handoff_to_", "")
            .replace(/_/g, " ");
          const targetAgent = currentAgent.handoffs.find(
            (a) => a.name.toLowerCase() === targetName,
          );

          if (targetAgent) {
            // Switch agent context
            currentAgent = targetAgent;
            currentSystemPrompt =
              typeof targetAgent.instructions === "function"
                ? targetAgent.instructions(context)
                : targetAgent.instructions;

            // Rebuild tools for the new agent
            anthropicTools.length = 0;
            for (const t of targetAgent.tools ?? []) {
              anthropicTools.push({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
              });
            }
            if (targetAgent.handoffs?.length) {
              anthropicTools.push(...makeHandoffTools(targetAgent.handoffs));
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Handed off to ${targetAgent.name}. You are now ${targetAgent.name}. Continue helping the user.`,
            });

            toolCalls.push({
              tool: block.name,
              input: block.input,
              output: `Handed off to ${targetAgent.name}`,
            });
            continue;
          }
        }

        // Regular tool call
        const toolDef = (currentAgent.tools ?? []).find(
          (t) => t.name === block.name,
        );

        if (!toolDef) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: Unknown tool "${block.name}"`,
            is_error: true,
          });
          continue;
        }

        try {
          const output = await toolDef.execute(
            block.input as Record<string, unknown>,
            context,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: output,
          });
          toolCalls.push({
            tool: block.name,
            input: block.input,
            output,
          });
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.message : "Tool execution failed";
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${errMsg}`,
            is_error: true,
          });
        }
      }

      // Add tool results
      messages.push({ role: "user", content: toolResults });
    }
  }

  // If we ran out of turns, return whatever we have
  return {
    output: "The agent reached the maximum number of turns without completing.",
    agentName: currentAgent.name,
    toolCalls,
  };
}

/* ------------------------------------------------------------------ */
/*  Streaming agent runner                                             */
/* ------------------------------------------------------------------ */

export async function runAgentStream(
  agent: AgentDefinition,
  userMessage: string,
  context: FridayContext = {},
  maxTurns = 12,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const client = getAnthropicClient();

        const systemPrompt =
          typeof agent.instructions === "function"
            ? agent.instructions(context)
            : agent.instructions;

        const anthropicTools: Anthropic.Tool[] = (agent.tools ?? []).map(
          (t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          }),
        );

        if (agent.handoffs?.length) {
          anthropicTools.push(...makeHandoffTools(agent.handoffs));
        }

        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: userMessage },
        ];

        let currentAgent = agent;
        let currentSystemPrompt = systemPrompt;

        for (let turn = 0; turn < maxTurns; turn++) {
          const stream = client.messages.stream({
            model: currentAgent.model ?? env.model,
            max_tokens: currentAgent.maxTokens ?? 4096,
            temperature: currentAgent.temperature ?? 0.7,
            system: currentSystemPrompt,
            tools: anthropicTools.length > 0 ? anthropicTools : undefined,
            messages,
          });

          // Collect the full response while streaming text chunks
          const response = await stream.on("text", (text) => {
            controller.enqueue(encoder.encode(text));
          }).finalMessage();

          if (response.stop_reason === "end_turn") {
            controller.close();
            return;
          }

          if (response.stop_reason === "tool_use") {
            messages.push({ role: "assistant", content: response.content });
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of response.content) {
              if (block.type !== "tool_use") continue;

              // Handle handoff
              if (
                block.name.startsWith("handoff_to_") &&
                currentAgent.handoffs
              ) {
                const targetName = block.name
                  .replace("handoff_to_", "")
                  .replace(/_/g, " ");
                const targetAgent = currentAgent.handoffs.find(
                  (a) => a.name.toLowerCase() === targetName,
                );

                if (targetAgent) {
                  currentAgent = targetAgent;
                  currentSystemPrompt =
                    typeof targetAgent.instructions === "function"
                      ? targetAgent.instructions(context)
                      : targetAgent.instructions;

                  anthropicTools.length = 0;
                  for (const t of targetAgent.tools ?? []) {
                    anthropicTools.push({
                      name: t.name,
                      description: t.description,
                      input_schema: t.input_schema,
                    });
                  }
                  if (targetAgent.handoffs?.length) {
                    anthropicTools.push(
                      ...makeHandoffTools(targetAgent.handoffs),
                    );
                  }

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: `Handed off to ${targetAgent.name}. You are now ${targetAgent.name}. Continue helping the user.`,
                  });
                  continue;
                }
              }

              // Regular tool
              const toolDef = (currentAgent.tools ?? []).find(
                (t) => t.name === block.name,
              );

              if (!toolDef) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: `Error: Unknown tool "${block.name}"`,
                  is_error: true,
                });
                continue;
              }

              try {
                const output = await toolDef.execute(
                  block.input as Record<string, unknown>,
                  context,
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: output,
                });
              } catch (err) {
                const errMsg =
                  err instanceof Error ? err.message : "Tool execution failed";
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: `Error: ${errMsg}`,
                  is_error: true,
                });
              }
            }

            messages.push({ role: "user", content: toolResults });
          }
        }

        controller.enqueue(
          encoder.encode(
            "\n[Agent reached maximum turns without completing.]",
          ),
        );
        controller.close();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Agent execution failed";
        controller.enqueue(encoder.encode(`\nError: ${msg}`));
        controller.close();
      }
    },
  });
}
