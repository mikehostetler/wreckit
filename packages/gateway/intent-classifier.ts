import type { Intent } from "../shared/contracts.js";

const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  START_SESSION: [
    /\b(start|new|begin|create)\s+(session|project|work)/i,
    /^start$/i,
    /^new session$/i,
  ],
  SYNTHESIZE: [
    /^(synthesize|synthesise|synth)$/i,
    /\b(make tickets?|write spec|create tickets?|generate spec)\b/i,
    /\b(analyze|analyse|process)\s+notes?\b/i,
  ],
  EXECUTE: [
    /^(go|execute|implement|run|build|do it|ship|make it happen)$/i,
    /^impl$/i,
  ],
  APPROVE: [
    /^(approve|yes|confirm|lgtm|looks good)$/i,
    /^y$/i,
  ],
  STATUS: [
    /^(status|where are we|progress|current state)$/i,
    /^what'?s (happening|going on)$/i,
  ],
  STOP: [
    /^(stop|pause|kill|cancel|abort|halt)$/i,
    /^x$/i,
  ],
  MERGE: [
    /^(merge|ship it|deploy|land)$/i,
  ],
  SWITCH_REPO: [
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/,
  ],
  NOTES: [
    /^(notes|show notes|view notes|my notes|list notes)$/i,
  ],
  CLEAR_NOTES: [
    /^(clear notes|reset notes|delete notes|wipe notes|clear all notes)$/i,
  ],
  ASK: [
    /^(ask|question|q:)\s+.+/i,
    /^\?\s+.+/i,
    /.+\?$/,
  ],
  GREP: [
    /^(grep|search|find)\s+.+/i,
    /^\/\/.+/i,
  ],
  DIFF: [
    /^(diff|changes|show changes|what changed)$/i,
  ],
  REVERT: [
    /^(revert|undo)\s+(T-\d+|last)$/i,
  ],
  LOGS: [
    /^(logs|verbose|logs on|logs off)$/i,
  ],
  IMPORT_ISSUE: [
    /^(issue|#)\s*#?\d+$/i,
    /^import\s+issue\s+#?\d+$/i,
  ],
  IMPORT_THREAD: [
    /^(context|import|thread)\s+@?T-[a-f0-9-]+$/i,
    /^@T-[a-f0-9-]+$/i,
  ],
  AMP_CHAT: [
    /^amp\s+threads\s+continue\s+T-[a-f0-9-]+/i,
    /^(amp|chat|continue)\s+@?T-[a-f0-9-]+/i,
    /^@T-[a-f0-9-]+\s+.+/i,
  ],
  AMP_END: [
    /^(end chat|exit amp|stop amp|\/end)$/i,
  ],
  HELP: [
    /^(help|commands|\?\?)$/i,
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
• \`approve\` / \`go\` - Approve & execute tickets
• \`status\` - Session status
• \`notes\` - View captured notes
• \`merge\` - Merge session PRs
• \`stop\` - Stop execution

🔍 **Research**
• \`<question>?\` - Ask about repo (Amp)
• \`grep <pattern>\` - Search codebase
• \`diff\` - Show uncommitted changes
• \`issue #123\` - Import GitHub issue
• \`@T-xxx\` - Import Amp thread

🛠️ **Advanced**
• \`revert T-001\` - Undo ticket changes
• \`logs\` - Toggle verbose logs
• \`amp threads continue T-xxx\` - Amp chat
• \`/end\` - Disconnect Amp

📂 **Session**
• \`new session\` - Fresh session
• \`owner/repo\` - Switch repo

💡 **Tips**
• Screenshots work great for UI feedback
• Voice notes are transcribed automatically
• Say "ship it" to merge when checks pass`;
}
