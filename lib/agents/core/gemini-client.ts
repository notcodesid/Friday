import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from "@/lib/env";

export interface AIMessage {
  role: "user" | "model";
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

class GeminiClient {
  private keys: string[];
  private currentKeyIndex: number;
  private exhaustedKeys: Set<string>;
  private modelName: string;

  constructor() {
    this.keys = env.geminiApiKeys;
    this.currentKeyIndex = 0;
    this.exhaustedKeys = new Set();
    this.modelName = env.model;

    if (this.keys.length === 0) {
      throw new Error("No Gemini API keys found. Add GEMINI_API_KEY or GEMINI_API_KEYS to your environment.");
    }
  }

  private getCurrentKey(): string {
    if (this.currentKeyIndex >= this.keys.length) {
      this.currentKeyIndex = 0;
    }
    return this.keys[this.currentKeyIndex];
  }

  private rotateKey(): void {
    const currentKey = this.keys[this.currentKeyIndex];
    this.exhaustedKeys.add(currentKey);
    
    const originalIndex = this.currentKeyIndex;
    for (let i = 0; i < this.keys.length; i++) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      if (!this.exhaustedKeys.has(this.keys[this.currentKeyIndex])) {
        return;
      }
    }
    
    this.exhaustedKeys.clear();
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    console.log(`All keys exhausted, cycling back. Using key index: ${this.currentKeyIndex}`);
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("quota") ||
        msg.includes("too many requests") ||
        msg.includes("resource has been exhausted")
      );
    }
    return false;
  }

  async chat(messages: AIMessage[]): Promise<AIResponse> {
    const maxRetries = this.keys.length * 2;
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      const apiKey = this.getCurrentKey();
      
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: this.modelName,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          ],
        });

        const prompt = this.formatMessages(messages);
        const result = await model.generateContent(prompt);
        const response = result.response;

        return {
          content: response.text(),
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          },
        };
      } catch (error) {
        if (this.isRateLimitError(error)) {
          console.warn(`Gemini key ${this.currentKeyIndex} hit rate limit, rotating...`);
          this.rotateKey();
          continue;
        }
        throw error;
      }
    }

    throw new Error("All Gemini API keys exhausted after retries");
  }

  async streamChat(messages: AIMessage[], onChunk: (chunk: string) => void): Promise<AIResponse> {
    const maxRetries = this.keys.length * 2;
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      const apiKey = this.getCurrentKey();
      
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: this.modelName,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          ],
        });

        const prompt = this.formatMessages(messages);
        const result = await model.generateContentStream(prompt);
        
        let fullContent = "";
        for await (const chunk of result.stream) {
          const text = chunk.text();
          fullContent += text;
          onChunk(text);
        }

        return {
          content: fullContent,
          usage: {
            inputTokens: result.totalTokens ?? 0,
            outputTokens: 0,
          },
        };
      } catch (error) {
        if (this.isRateLimitError(error)) {
          console.warn(`Gemini key ${this.currentKeyIndex} hit rate limit, rotating...`);
          this.rotateKey();
          continue;
        }
        throw error;
      }
    }

    throw new Error("All Gemini API keys exhausted after retries");
  }

  private formatMessages(messages: AIMessage[]): string {
    return messages
      .map((msg) => {
        if (msg.role === "user") {
          return `User: ${msg.content}`;
        }
        return `Assistant: ${msg.content}`;
      })
      .join("\n\n");
  }
}

let _client: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!_client) {
    _client = new GeminiClient();
  }
  return _client;
}

export function resetGeminiClient(): void {
  _client = null;
}
