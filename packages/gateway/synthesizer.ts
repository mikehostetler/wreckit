import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { MobileConfig, SessionMeta, Observation, Ticket } from "../shared/contracts.js";
import { createLLMClient, type LLMClient, type ChatMessage } from "../providers/llm.js";
import { SessionStore } from "./session-store.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadPromptTemplate(name: string): string {
  const promptPath = join(__dirname, "prompts", `${name}.txt`);
  if (!existsSync(promptPath)) {
    throw new Error(`Prompt template not found: ${promptPath}`);
  }
  return readFileSync(promptPath, "utf-8");
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export interface NormalizerResult {
  observations: Observation[];
  meta: {
    totalNotes: number;
    extractedObservations: number;
  };
}

export interface CriticResult {
  blockingQuestions: {
    id: string;
    question: string;
    relatedObservations: string[];
    severity: "blocker" | "important" | "nice-to-have";
  }[];
  risks: {
    id: string;
    description: string;
    mitigation: string;
    relatedObservations: string[];
  }[];
  missingContext: string[];
  dependencies: string[];
  readyForImplementation: boolean;
  summary: string;
}

export interface SlicerResult {
  tickets: Ticket[];
  meta: {
    totalTickets: number;
    blockedTickets: number;
    readyTickets: number;
  };
}

export interface IntegratorResult {
  spec: {
    title: string;
    summary: string;
    tickets: {
      id: string;
      title: string;
      implementationGuide: string;
      filesLikelyChanged: string[];
      testingNotes: string;
    }[];
  };
  prompt: string;
  checklist: string[];
  mobileNote: string;
}

export interface SynthesisResult {
  observations: NormalizerResult;
  critic: CriticResult;
  tickets: SlicerResult;
  spec: IntegratorResult;
}

export class Synthesizer {
  private config: MobileConfig;
  private sessionStore: SessionStore;
  private llmClient: LLMClient;

  constructor(config: MobileConfig, sessionStore: SessionStore) {
    this.config = config;
    this.sessionStore = sessionStore;
    this.llmClient = createLLMClient(config, "synthesizer");
  }

  async synthesize(sessionId: string): Promise<SynthesisResult> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const notes = this.sessionStore.getNotes(sessionId);
    if (!notes || notes.trim() === "# Session Notes\n\n") {
      throw new Error("No notes to synthesize");
    }

    log.info(`Starting synthesis for session ${sessionId}`);

    const observations = await this.runNormalizer(notes);
    this.saveArtifact(sessionId, "observations.json", observations);
    log.info(`Extracted ${observations.observations.length} observations`);

    const critic = await this.runCritic(session, observations);
    this.saveArtifact(sessionId, "critic.json", critic);
    log.info(`Critic: ${critic.blockingQuestions.length} questions, ${critic.risks.length} risks`);

    const tickets = await this.runSlicer(session, observations, critic);
    this.saveArtifact(sessionId, "tickets.json", tickets);
    log.info(`Generated ${tickets.tickets.length} tickets`);

    const spec = await this.runIntegrator(session, observations, tickets);
    this.saveArtifact(sessionId, "spec.json", spec);
    this.saveArtifact(sessionId, "spec.md", this.formatSpecMarkdown(spec));
    this.saveArtifact(sessionId, "prompt.md", spec.prompt);
    this.saveArtifact(sessionId, "checklist.md", spec.checklist.join("\n"));
    log.info("Spec and prompt generated");

    return { observations, critic, tickets, spec };
  }

  private async runNormalizer(notes: string): Promise<NormalizerResult> {
    const template = loadPromptTemplate("session_normalizer");
    const prompt = renderTemplate(template, { NOTES: notes });

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a precise JSON generator. Return ONLY valid JSON, no markdown or explanation." },
      { role: "user", content: prompt },
    ];

    return this.llmClient.chatJSON<NormalizerResult>(messages, { temperature: 0.3 });
  }

  private async runCritic(session: SessionMeta, observations: NormalizerResult): Promise<CriticResult> {
    const template = loadPromptTemplate("critic_gap_finder");
    const prompt = renderTemplate(template, {
      REPO_OWNER: session.repo?.owner || "unknown",
      REPO_NAME: session.repo?.name || "unknown",
      OBSERVATIONS: JSON.stringify(observations.observations, null, 2),
    });

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a precise JSON generator. Return ONLY valid JSON, no markdown or explanation." },
      { role: "user", content: prompt },
    ];

    return this.llmClient.chatJSON<CriticResult>(messages, { temperature: 0.3 });
  }

  private async runSlicer(
    session: SessionMeta,
    observations: NormalizerResult,
    critic: CriticResult
  ): Promise<SlicerResult> {
    const template = loadPromptTemplate("ticket_slicer");
    
    const availableRepos = this.config.repos
      .map((r) => `- ${r.owner}/${r.name}`)
      .join("\n");
    
    const prompt = renderTemplate(template, {
      REPO_OWNER: session.repo?.owner || "unknown",
      REPO_NAME: session.repo?.name || "unknown",
      AVAILABLE_REPOS: availableRepos || "- (none configured)",
      OBSERVATIONS: JSON.stringify(observations.observations, null, 2),
      CRITIC_FEEDBACK: JSON.stringify(critic, null, 2),
    });

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a precise JSON generator. Return ONLY valid JSON, no markdown or explanation." },
      { role: "user", content: prompt },
    ];

    return this.llmClient.chatJSON<SlicerResult>(messages, { temperature: 0.3 });
  }

  private async runIntegrator(
    session: SessionMeta,
    observations: NormalizerResult,
    tickets: SlicerResult
  ): Promise<IntegratorResult> {
    const template = loadPromptTemplate("spec_integrator");
    const prompt = renderTemplate(template, {
      REPO_OWNER: session.repo?.owner || "unknown",
      REPO_NAME: session.repo?.name || "unknown",
      SESSION_ID: session.id,
      TICKETS: JSON.stringify(tickets.tickets, null, 2),
      OBSERVATIONS: JSON.stringify(observations.observations, null, 2),
    });

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a precise JSON generator. Return ONLY valid JSON, no markdown or explanation." },
      { role: "user", content: prompt },
    ];

    return this.llmClient.chatJSON<IntegratorResult>(messages, { temperature: 0.3 });
  }

  private saveArtifact(sessionId: string, filename: string, data: unknown): void {
    const sessionPath = join(
      this.sessionStore["basePath"],
      ".wreckit",
      "sessions",
      sessionId
    );
    const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    writeFileSync(join(sessionPath, filename), content);
  }

  private formatSpecMarkdown(spec: IntegratorResult): string {
    const lines: string[] = [
      `# ${spec.spec.title}`,
      "",
      spec.spec.summary,
      "",
      "## Tickets",
      "",
    ];

    for (const ticket of spec.spec.tickets) {
      lines.push(`### ${ticket.id}: ${ticket.title}`);
      lines.push("");
      lines.push(ticket.implementationGuide);
      lines.push("");
      lines.push("**Files likely changed:**");
      for (const file of ticket.filesLikelyChanged) {
        lines.push(`- ${file}`);
      }
      lines.push("");
      lines.push(`**Testing:** ${ticket.testingNotes}`);
      lines.push("");
    }

    lines.push("## Checklist");
    lines.push("");
    lines.push(spec.checklist.join("\n"));

    return lines.join("\n");
  }
}
