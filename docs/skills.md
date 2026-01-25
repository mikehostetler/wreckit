# Skills Configuration

## Overview

Skills enable phase-specific capability loading in Wreckit. A skill defines reusable capabilities (tools, MCP servers, context requirements) that can be dynamically loaded for specific workflow phases.

Skills provide:

- **Tool Grouping**: Combine related tools into reusable capabilities
- **JIT Context Loading**: Automatically load files, git status, and artifacts into agent prompts
- **Security Boundaries**: Skills are intersected with phase permissions (skills cannot exceed phase tool allowlists)
- **Composability**: Multiple skills can be loaded per phase (tools merge, MCP servers merge)

## Configuration

Skills are configured in `.wreckit/skills.json`:

```json
{
  "phase_skills": {
    "research": ["code-exploration", "context-awareness"],
    "plan": ["documentation-writer"],
    "implement": ["full-capability"]
  },
  "skills": [
    {
      "id": "code-exploration",
      "name": "Code Exploration",
      "description": "Read-only codebase analysis",
      "tools": ["Read", "Glob", "Grep"],
      "required_context": [
        {
          "type": "git_status",
          "description": "Current repository state"
        }
      ]
    }
  ]
}
```

## Schema Reference

### SkillConfigSchema

```typescript
{
  phase_skills: Record<string, string[]>;  // phase -> skill IDs
  skills: Skill[];                          // skill definitions
}
```

### SkillSchema

```typescript
{
  id: string;                                // unique identifier
  name: string;                              // human-readable name
  description: string;                       // what this skill does
  tools: string[];                           // tool names required
  mcp_servers?: Record<string, any>;         // optional MCP servers
  required_context?: SkillContextRequirement[]; // JIT context requirements
}
```

### SkillContextRequirementSchema

```typescript
{
  type: "file" | "git_status" | "item_metadata" | "phase_artifact";
  path?: string;     // for "file" and "phase_artifact" types
  description?: string;
}
```

## Context Requirement Types

### `type: "file"`

Load a file from the repository:

```json
{
  "type": "file",
  "path": "README.md",
  "description": "Project README for context"
}
```

### `type: "git_status"`

Capture current git status:

```json
{
  "type": "git_status",
  "description": "Current repository state"
}
```

Output format:
```
M src/index.ts
A src/new-file.ts
D src/old-file.ts
```

### `type: "item_metadata"`

Serialize item metadata as JSON:

```json
{
  "type": "item_metadata",
  "description": "Item metadata"
}
```

Output format:
```json
{
  "id": "033-implement-phase-specific-skill-loading",
  "title": "Implement Phase-Specific Skill Loading",
  "state": "implementing",
  ...
}
```

### `type: "phase_artifact"`

Load a phase artifact (research.md, plan.md, prd.json, etc.):

```json
{
  "type": "phase_artifact",
  "path": "research.md",
  "description": "Existing research document"
}
```

## Security Model

**Skills cannot exceed phase permissions.**

The final tool allowlist is the **intersection** of:
1. Phase tool allowlist (from `src/agent/toolAllowlist.ts`)
2. Union of all skill tools loaded for the phase

Example:
- Research phase allows: `[Read, Write, Glob, Grep]`
- Skill requests: `[Read, Bash]`
- Final allowlist: `[Read]` (Bash excluded by phase permissions)

This ensures security boundaries are always enforced, regardless of skill configuration.

## Tool Names Reference

Available tools (from `src/agent/toolAllowlist.ts`):

- `Read` - Read file contents
- `Write` - Write files
- `Edit` - Edit files (in-place)
- `Glob` - File pattern matching
- `Grep` - Search file contents
- `Bash` - Execute shell commands
- `mcp__wreckit__save_prd` - Save PRD via MCP
- `mcp__wreckit__update_story_status` - Update story status via MCP

MCP tools use format: `mcp__<server>__<tool>`

## Examples

### Example 1: Code Analysis Skill

```json
{
  "id": "code-analysis",
  "name": "Code Analysis",
  "description": "Analyze codebase patterns and dependencies",
  "tools": ["Read", "Glob", "Grep"],
  "required_context": [
    {
      "type": "file",
      "path": "tsconfig.json",
      "description": "TypeScript configuration"
    },
    {
      "type": "git_status",
      "description": "Current changes"
    }
  ]
}
```

### Example 2: Test Generation Skill

```json
{
  "id": "test-generation",
  "name": "Test Generation",
  "description": "Generate unit tests for implementation",
  "tools": ["Read", "Write", "Grep"],
  "required_context": [
    {
      "type": "phase_artifact",
      "path": "prd.json",
      "description": "User stories for test coverage"
    }
  ]
}
```

### Example 3: Refactoring Skill

```json
{
  "id": "refactoring",
  "name": "Refactoring",
  "description": "Refactor code with test verification",
  "tools": ["Read", "Edit", "Grep", "Bash"],
  "required_context": [
    {
      "type": "git_status",
      "description": "Baseline state"
    },
    {
      "type": "file",
      "path": "package.json",
      "description": "Test scripts"
    }
  ]
}
```

## Backward Compatibility

Skills are **fully optional**. If `.wreckit/skills.json` is not present:

- All phases use static tool allowlists (existing behavior)
- No JIT context loading occurs
- No MCP servers are attached
- No breaking changes to existing repos

## Best Practices

### 1. Keep Skills Focused

Each skill should have a single, well-defined purpose. Avoid creating "god skills" that do everything.

❌ Bad:
```json
{
  "id": "everything",
  "tools": ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "..."]
}
```

✅ Good:
```json
{
  "id": "code-exploration",
  "tools": ["Read", "Glob", "Grep"]
}
```

### 2. Use Context Requirements Wisely

Only load context that's actually needed. Excessive context can:
- Slow down phase execution
- Consume token limits
- Reduce agent focus

✅ Good: Load research.md during planning
✅ Good: Load git status during PR creation
❌ Bad: Load entire package.json in every phase

### 3. Respect Phase Boundaries

Skills should align with phase semantics:
- Research skills: Read-only (Read, Glob, Grep)
- Plan skills: Documentation (Read, Write, Edit)
- Implement skills: Full capability (Read, Write, Edit, Bash)

### 4. Document Skills

Always provide clear descriptions:
- What the skill does
- When to use it
- What tools it requires
- What context it loads

### 5. Test Skills Incrementally

Test skills with `--dry-run` first:
```bash
wreckit phase research --dry-run
```

Check logs for:
- Loaded skill IDs
- JIT context summary
- Context loading errors

## Troubleshooting

### Skills Not Loading

**Symptom**: Logs show "Loaded skills for phase 'X': "

**Causes**:
- `phase_skills` mapping missing the phase
- Skill IDs don't match skill definitions
- `.wreckit/skills.json` has invalid JSON

**Fix**:
```bash
# Validate JSON
cat .wreckit/skills.json | jq .

# Check phase_skills mapping
jq '.phase_skills.research' .wreckit/skills.json
```

### Tools Not Available

**Symptom**: Agent can't use a tool that a skill defines

**Cause**: Tool excluded by phase permissions (security intersection)

**Fix**:
```bash
# Check phase tool allowlist
# src/agent/toolAllowlist.ts
```

Remember: Skills ∩ PhaseTools = FinalAllowlist

### Context Not Loading

**Symptom**: `{{skill_context}}` empty in prompt

**Causes**:
- `required_context` missing from skill
- File paths incorrect
- Artifact doesn't exist yet

**Fix**:
- Check logs for "Context loading errors"
- Verify file paths are relative to repo root
- Ensure artifacts exist before loading them

### MCP Server Conflicts

**Symptom**: MCP tools not available

**Cause**: Skill MCP server name conflicts with wreckit server

**Fix**:
- Use unique MCP server names in skills
- Document MCP server dependencies
- Test MCP tools with `--dry-run`

## Migration Guide

### Adding Skills to Existing Repo

1. Create `.wreckit/skills.json`:
```bash
cp .wreckit/skills.json .wreckit/skills.json.bak  # Backup default
# Edit skills.json for your project
```

2. Test with dry-run:
```bash
wreckit phase research --dry-run
```

3. Verify skills loaded:
```bash
# Check logs for "Loaded skills for phase 'research': ..."
```

4. Run phase:
```bash
wreckit phase research
```

### Removing Skills

Simply delete `.wreckit/skills.json`. Wreckit will revert to static tool allowlists.

```bash
rm .wreckit/skills.json
```

## Advanced Usage

### MCP Servers in Skills

Skills can define custom MCP servers:

```json
{
  "id": "database-query",
  "name": "Database Query",
  "tools": ["mcp__database__query"],
  "mcp_servers": {
    "database": {
      "name": "database",
      "command": "node",
      "args": ["./db-mcp-server.js"]
    }
  }
}
```

### Skill Composition

Multiple skills can be loaded per phase. Their tools and MCP servers merge:

```json
{
  "phase_skills": {
    "implement": ["test-generation", "git-integration"]
  }
}
```

Final tool allowlist: union of both skills' tools (intersected with phase permissions).

## Default Skills

Wreckit includes default skills in `.wreckit/skills.json`:

- `code-exploration` - Read-only codebase analysis
- `context-awareness` - Loads existing artifacts
- `documentation-writer` - Creates plans and PRDs
- `full-capability` - All implementation tools
- `git-integration` - Git operations for PRs
- `verification` - Final verification checks

You can customize these or create your own.
