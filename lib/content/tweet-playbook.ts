import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const PLAYBOOK_PDF_PATH = path.join(
  process.cwd(),
  "data",
  "how to write banger tweets _ ratnakar.pdf",
);

type TweetPlaybook = {
  sourcePath: string;
  text: string;
};

let cachedPlaybookPromise: Promise<TweetPlaybook | null> | null = null;

async function extractPdfText(pdfPath: string) {
  const { stdout } = await execFileAsync("pdftotext", [pdfPath, "-"], {
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getTweetPlaybook(): Promise<TweetPlaybook | null> {
  if (!cachedPlaybookPromise) {
    cachedPlaybookPromise = (async () => {
      try {
        await access(PLAYBOOK_PDF_PATH);
      } catch {
        return null;
      }

      try {
        const text = await extractPdfText(PLAYBOOK_PDF_PATH);
        if (!text) {
          return null;
        }

        return {
          sourcePath: PLAYBOOK_PDF_PATH,
          text,
        };
      } catch {
        return null;
      }
    })();
  }

  return cachedPlaybookPromise;
}

export { PLAYBOOK_PDF_PATH };
