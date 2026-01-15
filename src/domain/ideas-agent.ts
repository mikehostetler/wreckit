import { runAgent, getAgentConfig } from "../agent/runner";
import { loadConfig } from "../config";
import { logger } from "../logging";

export interface AgentParsedIdea {
  title: string;
  overview: string;
}

export async function parseIdeasWithAgent(
  text: string,
  root: string
): Promise<AgentParsedIdea[]> {
  const prompt = `You are parsing a document containing multiple feature/improvement ideas.

Extract each distinct idea as a separate item with:
- title: A concise title (under 60 chars)
- overview: A brief description of the idea

Return ONLY valid JSON array, no markdown fences:
[{"title": "...", "overview": "..."}, ...]

Document to parse:
---
${text}
---`;

  const resolvedConfig = await loadConfig(root);
  const config = getAgentConfig(resolvedConfig);

  const result = await runAgent({
    cwd: root,
    prompt,
    config,
    logger,
    onStdoutChunk: () => {},
  });

  const jsonMatch = result.output.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Agent did not return valid JSON array");
  }

  return JSON.parse(jsonMatch[0]) as AgentParsedIdea[];
}
