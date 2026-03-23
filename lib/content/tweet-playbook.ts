import { readFile } from "node:fs/promises";
import path from "node:path";

const PLAYBOOK_TEXT_PATH = path.join(
  process.cwd(),
  "data",
  "how to write banger tweets _ ratnakar.txt",
);
const PLAYBOOK_PDF_PATH = path.join(
  process.cwd(),
  "data",
  "how to write banger tweets _ ratnakar.pdf",
);

type TweetPlaybook = {
  sourcePath: string;
  text: string;
};

type TweetPlaybookLoadResult =
  | {
      ok: true;
      playbook: TweetPlaybook;
    }
  | {
      ok: false;
      reason: string;
    };

let cachedPlaybookPromise: Promise<TweetPlaybookLoadResult> | null = null;

function normalizePlaybookText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\d{1,2}\/\d{1,2}\/\d{2},/.test(line))
    .filter((line) => line !== "how to write banger tweets | ratnakar")
    .filter((line) => line !== "https://www.ratnakar.xyz/bangerplaybook")
    .filter((line) => !/^\d+\/\d+$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadTweetPlaybook(): Promise<TweetPlaybookLoadResult> {
  try {
    const rawText = await readFile(PLAYBOOK_TEXT_PATH, "utf8");
    const text = normalizePlaybookText(rawText);

    if (!text) {
      return {
        ok: false,
        reason: `The bundled tweet playbook text file is empty at ${PLAYBOOK_TEXT_PATH}.`,
      };
    }

    return {
      ok: true,
      playbook: {
        sourcePath: PLAYBOOK_TEXT_PATH,
        text,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown file read error.";

    return {
      ok: false,
      reason: `Could not load the bundled tweet playbook text file at ${PLAYBOOK_TEXT_PATH}: ${message}`,
    };
  }
}

export async function getTweetPlaybook(): Promise<TweetPlaybook | null> {
  if (!cachedPlaybookPromise) {
    cachedPlaybookPromise = loadTweetPlaybook();
  }

  const result = await cachedPlaybookPromise;
  return result.ok ? result.playbook : null;
}

export async function getTweetPlaybookLoadError() {
  if (!cachedPlaybookPromise) {
    cachedPlaybookPromise = loadTweetPlaybook();
  }

  const result = await cachedPlaybookPromise;
  return result.ok ? null : result.reason;
}

export { PLAYBOOK_PDF_PATH, PLAYBOOK_TEXT_PATH };
