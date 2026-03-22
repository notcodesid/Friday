import type { DistributionPlan } from "@/lib/agents/schemas";

export type AgentRunStatus = "running" | "succeeded" | "failed";

export type AgentRunRecord = {
  id: string;
  agentId: string;
  status: AgentRunStatus;
  siteUrl: string;
  channels: string[];
  notes?: string;
  output?: DistributionPlan;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentRunInput = Omit<
  AgentRunRecord,
  "id" | "createdAt" | "updatedAt" | "output" | "error"
> & {
  output?: DistributionPlan;
  error?: string;
};

export type UpdateAgentRunInput = Partial<
  Pick<AgentRunRecord, "status" | "output" | "error">
>;

export interface RunStore {
  listRuns(): Promise<AgentRunRecord[]>;
  createRun(input: CreateAgentRunInput): Promise<AgentRunRecord>;
  updateRun(id: string, patch: UpdateAgentRunInput): Promise<AgentRunRecord>;
}
