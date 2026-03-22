import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!env.anthropicApiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is missing. Add it to your environment.",
      );
    }
    _client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return _client;
}
