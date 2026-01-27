import { createLogger } from "../../src/logging.js";
import type { MobileConfig } from "../shared/contracts.js";

const log = createLogger({ verbose: true });

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMClient {
  chat(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse>;
  chatJSON<T>(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<T>;
}

export class ZAIClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: NonNullable<MobileConfig["llm"]["zai"]>) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
  }

  async chat(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 4096 } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Z.AI API error: ${response.status} - ${errorText}`);
        throw new Error(`Z.AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      return {
        content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
            }
          : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("LLM request timed out after 120 seconds");
      }
      throw error;
    }
  }

  async chatJSON<T>(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<T> {
    const response = await this.chat(messages, options);
    const content = response.content;

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

    try {
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      log.error(`Failed to parse JSON from LLM response: ${content.slice(0, 200)}`);
      throw new Error("Failed to parse JSON from LLM response");
    }
  }
}

export function createLLMClient(config: MobileConfig, role: "synthesizer" | "implementer" | "reviewer"): LLMClient {
  const provider = config.llm.roles[role];

  if (provider === "zai" && config.llm.zai) {
    return new ZAIClient(config.llm.zai);
  }

  if (provider === "zai") {
    throw new Error("Z.AI configured but no API key provided");
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}
