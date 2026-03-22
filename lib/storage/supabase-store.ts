import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type {
  AgentRunRecord,
  CreateAgentRunInput,
  RunStore,
  UpdateAgentRunInput,
} from "@/lib/storage/types";

type AgentRunRow = {
  id: string;
  agent_id: string;
  status: AgentRunRecord["status"];
  site_url: string;
  channels: string[];
  notes: string | null;
  output: AgentRunRecord["output"] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    status: row.status,
    siteUrl: row.site_url,
    channels: row.channels,
    notes: row.notes ?? undefined,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Supabase is not configured.");
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export class SupabaseRunStore implements RunStore {
  private readonly client = getClient();

  async listRuns() {
    const { data, error } = await this.client
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapRow);
  }

  async createRun(input: CreateAgentRunInput) {
    const { data, error } = await this.client
      .from("agent_runs")
      .insert({
        agent_id: input.agentId,
        status: input.status,
        site_url: input.siteUrl,
        channels: input.channels,
        notes: input.notes ?? null,
        output: input.output ?? null,
        error: input.error ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapRow(data);
  }

  async updateRun(id: string, patch: UpdateAgentRunInput) {
    const updatePayload: {
      status?: AgentRunRecord["status"];
      output?: AgentRunRecord["output"] | null;
      error?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (patch.status) {
      updatePayload.status = patch.status;
    }

    if ("output" in patch) {
      updatePayload.output = patch.output ?? null;
    }

    if ("error" in patch) {
      updatePayload.error = patch.error ?? null;
    }

    const { data, error } = await this.client
      .from("agent_runs")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapRow(data);
  }
}
