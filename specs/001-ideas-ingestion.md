# 001 - Ideas Ingestion Phase

## Overview

The Ideas Ingestion phase is the **entry point** to the wreckit workflow. Its purpose is to capture raw ideas from various sources and create structured items in the `idea` state.

This phase does **not** perform research, planning, or implementation—it solely captures and persists structured idea data that feeds into subsequent workflow phases.

### State Machine Position

```
[IDEAS INGESTION] → idea → researched → planned → implementing → in_pr → done
        ↑
    You are here
```

---

## Security Model: Extraction-Only Guarantee

The ideas phase operates under a strict **extraction-only** security model. The agent must be constrained to text analysis and structured output—it must never access the codebase, write files, or execute commands.

### Core Guardrails

| Guardrail                | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Tool Allowlist**       | Agent can ONLY call the designated idea-saving tool; all other tools are blocked |
| **No Filesystem Access** | Read, Write, Edit tools are not in the allowlist                                 |
| **No Command Execution** | Bash, shell, and command tools are not in the allowlist                          |
| **No Codebase Access**   | Grep, Search, Glob tools are not in the allowlist                                |
| **Data Capture Only**    | The allowed tool captures ideas in-memory; it does not write to disk directly    |
| **Schema Validation**    | All captured ideas are validated against a strict schema before acceptance       |

### What the Agent Cannot Do

During ideas ingestion, the agent is explicitly prevented from:

- Reading any files in the repository
- Writing or modifying any files
- Executing shell commands
- Accessing environment variables or secrets
- Making network requests beyond the LLM API
- Calling any MCP tools other than the designated idea-saving tool

### Failure Mode: Fail-Closed

If tool restrictions cannot be enforced, the phase must **abort** rather than proceed with weakened security. The system should never fall back to unrestricted agent execution.

---

## Input Modes

The `wreckit ideas` command supports three input modes:

| Mode                      | Trigger                                               | Description                                 |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| **Piped stdin**           | `wreckit ideas < FILE` or `cat file \| wreckit ideas` | Reads from stdin when input is piped        |
| **File input**            | `wreckit ideas --file PATH`                           | Reads from a specified file path            |
| **Interactive interview** | `wreckit ideas` (no stdin)                            | Launches a conversational interview session |

**Priority order:**

1. `--file PATH` flag
2. Piped stdin
3. Interactive interview (fallback when running in terminal with no input)

---

## What This Phase Accomplishes

### Document Parsing (stdin/file)

When input is provided via file or stdin, the system extracts structured ideas from the raw text. The agent analyzes the document and identifies discrete ideas, extracting key fields like title, description, problem statement, and success criteria.

The agent is restricted to extraction only—it cannot access the codebase, write files, or execute commands. This ensures the ideas phase is purely about capturing intent, not making changes.

### Interactive Interview

When running in a terminal without piped input, the system launches a conversational interview. The AI asks clarifying questions to help articulate the idea, exploring:

- What problem needs solving
- Why it matters
- What success looks like
- Any constraints or scope boundaries

Users signal completion with phrases like "done," "that's it," "looks good," or "ship it." Users can cancel with "quit," "exit," or "cancel."

### Fallback Interview

If the conversational interview fails (due to missing credentials or network issues), the system falls back to a simple field-by-field interview that collects:

- Title (required)
- Description
- Problem statement
- Motivation
- Success criteria
- Technical constraints

---

## Artifacts Produced

For each captured idea, the system creates an item directory containing a structured item file with:

- **Identifier:** A sequential number with a slugified title (e.g., `001-add-dark-mode`)
- **Title and description:** Core idea summary
- **Problem statement:** The core problem being solved
- **Motivation:** Why this matters
- **Success criteria:** How we know it's working
- **Technical constraints:** Implementation constraints
- **Scope boundaries:** What's in and out of scope
- **Priority and urgency hints:** Relative importance signals
- **Timestamps:** Creation and last-updated times

All items are created in the `idea` state, ready for the research phase.

---

## State Transitions

### Initial State

New items are created directly in the `idea` state. This is initial state assignment, not a transition.

### Next Phase

After ideas ingestion, items proceed to:

```
idea → [wreckit research] → researched
```

---

## Error Handling

### File Errors

If the specified file is not found, the command fails with a clear error message.

### Parsing Failures

If the agent cannot extract structured ideas from the input, it falls back to attempting JSON extraction from the output. If that also fails, an error is raised.

### Git Dirty Working Directory

A **warning** is shown if uncommitted changes exist, but the command proceeds. The ideas phase is read-only and cannot modify code, so this is informational only.

### Interview Failures

If the conversational interview fails, the system automatically falls back to the simple field-by-field interview.

---

## Security Error Cases

### Tool Allowlist Violation

If the agent attempts to call a tool not in the allowlist (filesystem access, bash, etc.):

| Scenario                   | Expected Behavior                                  |
| -------------------------- | -------------------------------------------------- |
| Agent calls `Read` tool    | Tool call blocked; error surfaced                  |
| Agent calls `Bash` tool    | Tool call blocked; error surfaced                  |
| Agent calls `Edit` tool    | Tool call blocked; error surfaced                  |
| Agent calls wrong MCP tool | Tool call blocked; only idea-saving tool permitted |

The agent run may continue or abort depending on the error, but **no side-effect occurs**.

### MCP Tool Call Failure

If the designated idea-saving tool fails or isn't called:

| Scenario                            | Expected Behavior                                        |
| ----------------------------------- | -------------------------------------------------------- |
| Tool call fails (schema validation) | Error returned to agent; may retry or fail               |
| Tool never called                   | Falls back to JSON parsing from output                   |
| Fallback JSON parsing fails         | Phase fails with "Agent did not return valid JSON array" |

**Note:** The JSON fallback weakens the "must use structured tool call" guarantee. Consider this a known gap that trades security for resilience.

### Schema Validation Failures

All captured ideas are validated against a strict schema:

| Validation                     | Failure Behavior        |
| ------------------------------ | ----------------------- |
| Missing required field (title) | Idea rejected           |
| Invalid field type             | Idea rejected           |
| Malformed structure            | Entire payload rejected |

### Payload Size Limits (Recommended)

To prevent denial-of-service or cost blowups, the following limits should be enforced:

| Limit                       | Recommended Value |
| --------------------------- | ----------------- |
| Maximum ideas per ingestion | 50                |
| Title length                | 120 characters    |
| Description length          | 2000 characters   |
| Success criteria items      | 20                |
| Total payload size          | 100 KB            |

Payloads exceeding these limits should be rejected with a clear error.

### Social Engineering Prevention

Even with tool restrictions, the agent could attempt to:

- Instruct users to run shell commands
- Request secrets or API keys
- Suggest unsafe actions

The prompt template must explicitly forbid these behaviors. Users should be warned to never follow agent instructions to run commands or share secrets during ingestion.

---

## Resumability

### Re-running the Command

The `wreckit ideas` command is safe to re-run with the same input:

1. **Deduplication by slug:** The system checks if an item with the same slug already exists
2. **Skip existing:** Existing items are skipped, not overwritten
3. **New items only:** Only genuinely new ideas are created

### Interrupted Runs

If the process is interrupted:

- **Before saving:** No partial state; re-run safely
- **During saving:** Some items may be created; re-run will skip those and continue

### Output

The command reports what was created and what was skipped:

```
Created 3 items:
  001-add-dark-mode
  002-fix-checkout-bug
  003-optimize-search

Skipped 1 existing items:
  004-add-notifications
```

---

## Dry Run Mode

The `--dry-run` flag previews what would be created without persisting:

```bash
wreckit ideas --file ideas.txt --dry-run
```

Output shows placeholder IDs since actual numbers aren't allocated:

```
Would create 3 items:
  XXX-add-dark-mode
  XXX-fix-checkout-bug
  XXX-optimize-search
```

---

## CLI Usage

```bash
# Piped input
cat ideas.txt | wreckit ideas
wreckit ideas < ideas.txt

# File input
wreckit ideas --file ideas.txt
wreckit ideas -f ideas.txt

# Interactive interview
wreckit ideas

# Options
wreckit ideas --dry-run     # Preview without creating
wreckit ideas --verbose     # Show detailed output
wreckit ideas --cwd /path   # Override working directory
```

---

## Implementation Status

| Feature                            | Status             | Notes                                   |
| ---------------------------------- | ------------------ | --------------------------------------- |
| **Piped stdin input**              | ✅ Implemented     | `wreckit ideas < FILE` works            |
| **File input**                     | ✅ Implemented     | `--file PATH` flag works                |
| **Interactive interview**          | ✅ Implemented     | Launches AI conversation when no input  |
| **Fallback interview**             | ✅ Implemented     | Field-by-field fallback on AI failure   |
| **MCP tool: save_interview_ideas** | ✅ Implemented     | See `src/agent/mcp/wreckitMcpServer.ts` |
| **MCP tool: save_parsed_ideas**    | ✅ Implemented     | See `src/agent/mcp/wreckitMcpServer.ts` |
| **Tool allowlist enforcement**     | ✅ Implemented     | See `src/agent/toolAllowlist.ts`        |
| **Schema validation**              | ✅ Implemented     | Zod schemas in `src/schemas.ts`         |
| **Deduplication by slug**          | ✅ Implemented     | Existing items skipped                  |
| **Dry-run mode**                   | ✅ Implemented     | `--dry-run` flag works                  |
| **Payload size limits**            | ❌ Not Implemented | Recommended limits not enforced         |
| **Social engineering prevention**  | 🔶 Partial         | Prompt instructions only                |

---

## Known Security Gaps

The following are known limitations of the current security model:

### Gap 1: JSON Fallback Bypasses Tool Requirement ✅ MITIGATED

If the agent doesn't call the MCP tool, the system parses JSON directly from the agent's text output. This means:

- The agent can bypass the "must use structured tool call" control flow
- Arbitrary JSON or mixed content could be accepted
- The structured extraction channel is weakened

**Status:** Mitigated - fallback output is validated against the same Zod schema.

### Gap 2: Extra MCP Tools Are Registered ✅ FIXED

~~The MCP server registers tools for other phases (`save_prd`, `update_story_status`) even during ingestion.~~

**Status:** Fixed - A dedicated `ideasMcpServer.ts` only registers idea-saving tools. See `src/agent/mcp/ideasMcpServer.ts`.

### Gap 3: Permission Bypass Mode

During interactive interview extraction, the system uses bypass-permissions mode to avoid prompts. If the allowlist enforcement is buggy, dangerous tools could execute without confirmation.

**Status:** Open - Allowlist is enforced at the SDK layer, but no abort-on-failure mechanism.

---

## See Also

- [002-research-phase.md](./002-research-phase.md) — Next phase in workflow
