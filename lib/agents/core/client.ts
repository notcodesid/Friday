import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicToolUseBlock = {
  type: "tool_use";
  name: string;
  input: unknown;
};

type AnthropicMessage = {
  content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

class MessagesAPI {
  private parent: GeminiAdapter;
  
  constructor(parent: GeminiAdapter) {
    this.parent = parent;
  }

  async create(params: { 
    messages: Array<{ role: string; content: string }>;
    model?: string;
    max_tokens?: number;
    stream?: boolean;
    system?: string;
    tools?: Array<{
      name: string;
      description: string;
      input_schema: unknown;
    }>;
    tool_choice?: { type: string; name?: string };
  }): Promise<AnthropicMessage> {
    return this.parent.createMessage(params);
  }
}

class GeminiAdapter {
  private keys: string[];
  private currentKeyIndex: number;
  private exhaustedKeys: Set<string>;
  private modelName: string;
  private client: GoogleGenerativeAI | null = null;
  messages: MessagesAPI;

  constructor() {
    this.keys = env.geminiApiKeys;
    this.currentKeyIndex = 0;
    this.exhaustedKeys = new Set();
    this.modelName = env.model;

    if (this.keys.length === 0) {
      throw new Error(
        "GEMINI_API_KEY(S) missing. Add comma-separated keys to your environment.\n" +
        "Example: GEMINI_API_KEYS=key1,key2,key3"
      );
    }

    this.messages = new MessagesAPI(this);
  }

  private updateClient(): void {
    const apiKey = this.keys[this.currentKeyIndex];
    this.client = new GoogleGenerativeAI(apiKey);
  }

  private rotateKey(): void {
    this.exhaustedKeys.add(this.keys[this.currentKeyIndex]);
    
    for (let i = 0; i < this.keys.length; i++) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      if (!this.exhaustedKeys.has(this.keys[this.currentKeyIndex])) {
        this.updateClient();
        return;
      }
    }
    
    this.exhaustedKeys.clear();
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    this.updateClient();
    console.log("All keys exhausted, cycling back to key index:", this.currentKeyIndex);
  }

  private isExhaustedError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("quota") ||
        msg.includes("too many requests") ||
        msg.includes("resource has been exhausted") ||
        msg.includes("limit") ||
        msg.includes("exhausted")
      );
    }
    return false;
  }

  async createMessage(params: { 
    messages: Array<{ role: string; content: string }>;
    model?: string;
    max_tokens?: number;
    stream?: boolean;
    system?: string;
    tools?: Array<{
      name: string;
      description: string;
      input_schema: unknown;
    }>;
    tool_choice?: { type: string; name?: string };
  }): Promise<AnthropicMessage> {
    this.updateClient();
    const model = this.client!.getGenerativeModel({ model: this.modelName });
    
    const maxRetries = this.keys.length * 2;
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      
      try {
        let prompt = "";
        
        if (params.system) {
          prompt += params.system + "\n\n";
        }

        if (params.tools && params.tools.length > 0) {
          prompt += "\nAvailable tools:\n";
          for (const tool of params.tools) {
            prompt += `- ${tool.name}: ${tool.description}\n`;
            prompt += `  Input schema: ${JSON.stringify(tool.input_schema)}\n`;
          }
          prompt += "\nIMPORTANT: When using a tool, respond with ONLY the tool call in this format:\n";
          prompt += '{"tool": "tool_name", "input": {...}}\n\n';
        }
        
        for (const msg of params.messages) {
          if (msg.role === "user") {
            prompt += msg.content + "\n\n";
          }
        }

        if (params.tools && params.tools.length > 0) {
          prompt += '\nYou must use a tool. Respond with a JSON object: {"tool": "name", "input": {...}}';
        }

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (params.tools && params.tools.length > 0) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.tool && parsed.input) {
                return {
                  content: [{
                    type: "tool_use" as const,
                    name: parsed.tool,
                    input: parsed.input,
                  }],
                  usage: { 
                    input_tokens: result.response.usageMetadata?.promptTokenCount ?? 0, 
                    output_tokens: result.response.usageMetadata?.candidatesTokenCount ?? 0 
                  },
                };
              }
            } catch {
              // Fall through to text output
            }
          }
        }

        return {
          content: [{ type: "text" as const, text }],
          usage: { 
            input_tokens: result.response.usageMetadata?.promptTokenCount ?? 0, 
            output_tokens: result.response.usageMetadata?.candidatesTokenCount ?? 0 
          },
        };
      } catch (error) {
        if (this.isExhaustedError(error)) {
          console.warn(`Key ${this.currentKeyIndex} exhausted (${attempts}/${maxRetries}), rotating...`);
          this.rotateKey();
          continue;
        }
        throw error;
      }
    }

    throw new Error("All Gemini API keys exhausted");
  }
}

let _client: GeminiAdapter | null = null;

export function getAnthropicClient(): GeminiAdapter {
  if (!_client) {
    _client = new GeminiAdapter();
  }
  return _client;
}

export function hasAnthropic(): boolean {
  return env.geminiApiKeys.length > 0;
}
