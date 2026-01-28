import type { MobileConfig } from "../shared/contracts.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

export async function transcribeVoice(
  audioBuffer: Buffer,
  config: MobileConfig
): Promise<string | null> {
  const openaiKey = config.llm.openai?.apiKey;
  if (!openaiKey) {
    log.info("OpenAI API key not configured - skipping voice transcription");
    return null;
  }

  try {
    const formData = new FormData();
    const uint8Array = new Uint8Array(audioBuffer);
    const blob = new Blob([uint8Array], { type: "audio/ogg" });
    formData.append("file", blob, "voice.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "en");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      log.error(`Whisper API error: ${response.status} ${error}`);
      return null;
    }

    const result = await response.json() as { text?: string };
    return result.text?.trim() || null;
  } catch (error) {
    log.error(`Voice transcription failed: ${error}`);
    return null;
  }
}
