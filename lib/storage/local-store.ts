import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AgentRunRecord,
  CreateAgentRunInput,
  RunStore,
  UpdateAgentRunInput,
} from "@/lib/storage/types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "agent-runs.json");

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, "[]\n", "utf8");
  }
}

async function readRuns() {
  await ensureDataFile();
  const contents = await readFile(dataFile, "utf8");
  return JSON.parse(contents) as AgentRunRecord[];
}

async function writeRuns(runs: AgentRunRecord[]) {
  await ensureDataFile();
  await writeFile(dataFile, `${JSON.stringify(runs, null, 2)}\n`, "utf8");
}

export class LocalRunStore implements RunStore {
  async listRuns() {
    const runs = await readRuns();
    return runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createRun(input: CreateAgentRunInput) {
    const runs = await readRuns();
    const timestamp = new Date().toISOString();

    const record: AgentRunRecord = {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input,
    };

    runs.push(record);
    await writeRuns(runs);
    return record;
  }

  async updateRun(id: string, patch: UpdateAgentRunInput) {
    const runs = await readRuns();
    const index = runs.findIndex((run) => run.id === id);

    if (index === -1) {
      throw new Error(`Run ${id} not found`);
    }

    const nextRecord: AgentRunRecord = {
      ...runs[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    runs[index] = nextRecord;
    await writeRuns(runs);
    return nextRecord;
  }
}
