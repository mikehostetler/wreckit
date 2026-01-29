import {
  AxAIAnthropic,
  AxAIOpenAI,
  AxAIGoogleGemini,
  type AxAIService,
} from "@ax-llm/ax";
import type { Logger } from "../logging";

/**
 * Creates and configures an AxAI service instance with proper authentication.
 * Handles custom proxies (like Z.AI) by injecting the Authorization header
 * and overriding hardcoded API URLs.
 */
export function createAxAI(
  env: Record<string, string>,
  logger: Logger,
): AxAIService {
  // Detection for Z.AI proxy
  const isZai = env.ANTHROPIC_BASE_URL?.includes("z.ai");

  if (isZai && env.ANTHROPIC_AUTH_TOKEN) {
    // Z.AI is OpenAI-compatible. Using AxAIOpenAI provides much better
    // prompt compatibility for GLM models than the Anthropic provider.
    const zaiUrl = env.ANTHROPIC_BASE_URL!.replace(/\/anthropic\/?$/, "/v1");

    logger.debug(`Z.AI detected. Switching to OpenAI-compatible provider at ${zaiUrl}`);

    return new AxAIOpenAI({
      apiKey: env.ANTHROPIC_AUTH_TOKEN,
      apiURL: zaiUrl,
      model: env.ANTHROPIC_DEFAULT_SONNET_MODEL || "glm-4.7",
      config: { maxRetries: 3 }
    });
  }

  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) {
    // Create custom options for AxAI
    const axaiOptions: any = {};

    // Support custom auth headers for proxies like Zai/Z.AI
    // Proxies often require Authorization: Bearer <token>
    if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_AUTH_TOKEN) {
      axaiOptions.fetch = async (
        url: string | Request | URL,
        init?: RequestInit,
      ) => {
        const headers = new Headers(init?.headers);
        // Remove default Anthropic header to prevent proxy confusion
        headers.delete("x-api-key");
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${env.ANTHROPIC_AUTH_TOKEN}`);
        }
        return fetch(url, { ...init, headers });
      };
      logger.debug(
        "Added custom Authorization header fetch wrapper for AxAI (removed x-api-key)",
      );
    }

    const ai = new AxAIAnthropic({
      apiKey: env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN!,
      options: axaiOptions,
    });

    if (env.ANTHROPIC_BASE_URL) {
      ai.setAPIURL(env.ANTHROPIC_BASE_URL);
      logger.debug(`Explicitly set AxAI API URL to ${env.ANTHROPIC_BASE_URL}`);
    }

    return ai;
  } else if (env.OPENAI_API_KEY) {
    return new AxAIOpenAI({ apiKey: env.OPENAI_API_KEY });
  } else if (env.GOOGLE_API_KEY) {
    return new AxAIGoogleGemini({ apiKey: env.GOOGLE_API_KEY });
  } else {
    throw new Error("No AI API key found in environment");
  }
}
