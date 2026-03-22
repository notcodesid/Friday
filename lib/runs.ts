import { agentRunInputSchema } from "@/lib/agents/schemas";
import { runContentDistributionAgent } from "@/lib/agents/content-distribution-agent";
import { getRunStore } from "@/lib/storage";

export async function listAgentRuns() {
  return getRunStore().listRuns();
}

export async function createAgentRun(input: unknown) {
  const parsed = agentRunInputSchema.parse(input);
  const store = getRunStore();

  const run = await store.createRun({
    agentId: "content-distribution",
    status: "running",
    siteUrl: parsed.siteUrl,
    channels: parsed.channels,
    notes: parsed.notes,
  });

  try {
    const output = await runContentDistributionAgent(parsed);
    return await store.updateRun(run.id, {
      status: "succeeded",
      output,
      error: undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown agent execution error.";

    return store.updateRun(run.id, {
      status: "failed",
      error: message,
    });
  }
}
