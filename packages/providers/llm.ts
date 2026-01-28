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
    const { temperature = 0.7, maxTokens = 16384 } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 480000);

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

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private useResponsesApi: boolean;

  constructor(config: NonNullable<MobileConfig["llm"]["openai"]>) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.useResponsesApi = config.model.startsWith("gpt-5");
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async chat(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 16384 } = options;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      try {
        let response: Response;
        let content: string;

        if (this.useResponsesApi) {
        const inputText = messages.map((m) => 
          m.role === "system" ? `[System]: ${m.content}` : m.content
        ).join("\n\n");

        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: inputText,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log.error(`OpenAI Responses API error: ${response.status} - ${errorText}`);
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        content = data.output_text || "";
      } else {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
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
          
          const errorBody = (() => {
            try { return JSON.parse(errorText); } catch { return null; }
          })();
          const errorCode = errorBody?.error?.code;
          const errorMessage = errorBody?.error?.message || errorText;
          
          if (errorCode === "insufficient_quota") {
            log.error(`OpenAI quota exceeded - add credits at https://platform.openai.com/settings/organization/billing`);
            throw new Error(`OpenAI quota exceeded: ${errorMessage}`);
          }
          
          if (response.status === 429 && attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt + 1) * 1000;
            log.warn(`Rate limited, retrying in ${waitTime / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
            clearTimeout(timeoutId);
            await this.sleep(waitTime);
            continue;
          }
          
          log.error(`OpenAI API error: ${response.status} - ${errorCode || "unknown"}: ${errorMessage}`);
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        content = data.choices?.[0]?.message?.content || "";
      }

      return { content };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("LLM request timed out after 180 seconds");
        }
        if (attempt < maxRetries - 1) {
          log.warn(`Request failed, retrying (attempt ${attempt + 1}/${maxRetries}): ${error}`);
          await this.sleep(2000);
          continue;
        }
        throw error;
      }
    }
    throw new Error("Max retries exceeded");
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

  if (provider === "openai" && config.llm.openai) {
    return new OpenAIClient(config.llm.openai);
  }

  if (provider === "zai") {
    throw new Error("Z.AI configured but no API key provided");
  }

  if (provider === "openai") {
    throw new Error("OpenAI configured but no API key provided");
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}
