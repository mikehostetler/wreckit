import type { Intent } from "../shared/contracts.js";

const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  START_SESSION: [
    /\b(start|new|begin|create)\s+(session|project|work)/i,
    /^start$/i,
    /^new session$/i,
  ],
  SYNTHESIZE: [
    /\b(synthesize|synthesise|make tickets?|write spec|create tickets?|generate spec)/i,
    /\b(analyze|analyse|process notes?)/i,
    /^synth$/i,
  ],
  EXECUTE: [
    /\b(go|execute|implement|run|build|do it|ship|make it happen)/i,
    /^go$/i,
    /^impl$/i,
  ],
  STATUS: [
    /\b(status|where are we|progress|what's (happening|going on)|show me|current state)/i,
    /^status$/i,
    /^\?$/,
  ],
  STOP: [
    /\b(stop|pause|kill|cancel|abort|halt)/i,
    /^stop$/i,
    /^x$/i,
  ],
  MERGE: [
    /\b(merge|ship it|deploy|push|land)/i,
    /^merge$/i,
  ],
  SWITCH_REPO: [
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/,
  ],
  HELP: [
    /\b(help|commands|how|what can you do)/i,
    /^help$/i,
    /^\?{2,}$/,
  ],
  CAPTURE_NOTE: [],
  UNKNOWN: [],
};

export function classifyIntent(text: string, configuredRepos: string[] = []): Intent {
  const trimmed = text.trim();

  if (configuredRepos.some((repo) => trimmed.toLowerCase() === repo.toLowerCase())) {
    return "SWITCH_REPO";
  }

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as [Intent, RegExp[]][]) {
    if (intent === "CAPTURE_NOTE" || intent === "UNKNOWN") continue;
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return intent;
      }
    }
  }

  return "CAPTURE_NOTE";
}

export function getHelpMessage(): string {
  return `🤖 **Wreckit Mobile Commands**

📝 **Capture Notes**
Just send any text, photos, or voice messages to capture them.

⚡ **Actions**
• \`synthesize\` - Create tickets from notes
• \`go\` / \`execute\` - Start implementation
• \`status\` - Show current session status
• \`stop\` - Stop current execution
• \`merge\` - Merge PR when ready

📂 **Session**
• \`new session\` - Start a fresh session
• \`owner/repo\` - Switch to a different repo

💡 **Tips**
• Screenshots work great for UI feedback
• Voice notes are transcribed automatically
• Say "ship it" to merge when checks pass`;
}
