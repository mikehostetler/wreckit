# `wreckit learn` Command

Extract and compile codebase patterns into reusable Skill artifacts.

## Overview

The `wreckit learn` command analyzes completed work to identify reusable patterns and compiles them into Skill artifacts (stored in `.wreckit/skills.json`). This enables the system to learn from its own implementations and improve over time.

## Usage

```bash
wreckit learn [options]
wreckit learn [patterns...] [options]
```

## Options

| Option               | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `--item <id>`        | Extract patterns from specific item (by ID, number, or slug)               |
| `--phase <state>`    | Extract patterns from items in specific state (e.g., `done`, `researched`) |
| `--all`              | Extract patterns from all completed items                                  |
| `--output <path>`    | Custom output path for skills.json (default: `.wreckit/skills.json`)       |
| `--merge <strategy>` | Merge strategy: `append` (default) or `replace`                            |
| `--review`           | Review extracted skills before saving (not yet implemented)                |
| `--dry-run`          | Preview without writing files                                              |
| `--verbose`          | Detailed logging                                                           |
| `--quiet`            | Errors only                                                                |

## Examples

### Extract from most recent completed items (default)

```bash
wreckit learn
```

### Extract from specific item

```bash
wreckit learn --item 033
wreckit learn --item phase-specific-skill-loading
```

### Extract from all completed items

```bash
wreckit learn --all
```

### Extract from items in specific state

```bash
wreckit learn --phase done
wreckit learn --phase researched
```

### Replace existing skills instead of merging

```bash
wreckit learn --all --merge replace
```

### Dry-run to preview changes

```bash
wreckit learn --all --dry-run
```

### Write to custom output path

```bash
wreckit learn --all --output .wreckit/custom-skills.json
```

### Verbose output for debugging

```bash
wreckit learn --item 033 --verbose
```

## How It Works

1. **Select source items**: Based on flags, selects which items to analyze
   - `--item <id>`: Single item by ID, numeric prefix, or slug suffix
   - `--phase <state>`: All items in a specific state
   - `--all`: All completed items
   - Default: Most recent 5 completed items

2. **Load existing skills**: Reads `.wreckit/skills.json` if it exists
   - If missing, starts fresh (creates new file)
   - Validates existing skills against schema

3. **Run extraction agent**: Analyzes source items with Read + Write + Glob + Grep tools
   - Agent examines research.md, plan.md, implemented code
   - Identifies patterns in tool usage, context requirements, and phase applicability
   - Clusters similar patterns into focused, reusable skills

4. **Validate output**: Ensures extracted skills conform to schema
   - Checks SkillConfigSchema structure
   - Validates skill IDs, names, descriptions, tools
   - Ensures phase_skills mapping is correct

5. **Merge skills**: Combines new skills with existing ones (append or replace)
   - **Append**: Keeps existing skills, adds new ones (default)
   - **Replace**: Overwrites entire `.wreckit/skills.json`

6. **Validate permissions**: Warns if skills request tools not allowed in target phases
   - Checks each skill's tools against PHASE_TOOL_ALLOWLISTS
   - Issues warnings but doesn't block writing
   - Helps catch configuration errors early

7. **Write skills.json**: Atomically writes final configuration
   - Uses safeWriteJson() to prevent corruption
   - Logs summary: extracted count, final total, output path

## Merge Strategies

### Append (default)

Preserves existing skills and adds new ones. If a skill with the same ID exists in both configs, the existing one is kept.

```bash
wreckit learn --merge append
```

**Behavior:**

- `phase_skills`: Merges phase mappings (keeps existing, adds new)
- `skills`: Keeps existing skills by ID, adds new ones

### Replace

Overwrites entire `.wreckit/skills.json` with newly extracted skills.

```bash
wreckit learn --merge replace
```

**Behavior:**

- Replaces both `phase_skills` and `skills` entirely
- Useful for complete regeneration of skill definitions

## Skill Validation

The command validates extracted skills in two ways:

### 1. Schema Validation

Ensures skills conform to `SkillConfigSchema`:

- Valid JSON structure
- Required fields present (id, name, description, tools)
- Correct data types (arrays, strings, objects)
- No unknown fields

Example error:

```
Error: skills.json format validation failed:
Invalid skill definition at skills[2]: 'description' is required
```

### 2. Tool Permission Validation

Warns if skills request tools not allowed in target phases.

Example warning:

```
Warning: Skill 'test-generation' requests tools not allowed in 'research' phase: Bash
```

**Tool Allowlists by Phase:**

- **research**: Read, Write, Glob, Grep
- **plan**: Read, Write, Edit, Glob, Grep, mcp**wreckit**save_prd
- **implement**: Read, Write, Edit, Glob, Grep, Bash, mcp**wreckit**update_story_status
- **pr**: Read, Glob, Grep, Bash
- **complete**: Read, Glob, Grep, mcp**wreckit**complete

## Output

The command creates or updates `.wreckit/skills.json`:

```json
{
  "phase_skills": {
    "research": ["code-exploration", "context-awareness"],
    "plan": ["documentation-writer"],
    "implement": ["full-capability"],
    "pr": ["git-integration"],
    "complete": ["verification"]
  },
  "skills": [
    {
      "id": "code-exploration",
      "name": "Code Exploration",
      "description": "Read-only codebase analysis with grep and glob tools",
      "tools": ["Read", "Glob", "Grep"],
      "required_context": [
        {
          "type": "git_status",
          "description": "Current repository state"
        }
      ],
      "mcp_servers": {}
    }
  ]
}
```

**Field Descriptions:**

- `phase_skills`: Maps phase names to arrays of skill IDs
- `skills`: Array of skill definitions
  - `id`: Unique identifier (kebab-case)
  - `name`: Human-readable name
  - `description`: What the skill does and when to use it
  - `tools`: Array of tool names the skill uses
  - `required_context` (optional): JIT context requirements
  - `mcp_servers` (optional): MCP server configuration

## Tips

### When to Use Different Flags

- **First time**: Run with `--dry-run` to preview what will be extracted
- **After successful implementation**: Use `--item <id>` to learn from specific wins
- **Periodic aggregation**: Use `--all` to compile patterns from all completed work
- **Clean slate**: Use `--merge replace` to regenerate skill definitions from scratch
- **Custom skills**: Use `--output` to create alternative skill sets for testing

### Best Practices

1. **Start with dry-run**: Always preview changes before writing

   ```bash
   wreckit learn --all --dry-run --verbose
   ```

2. **Learn from successes**: Extract patterns from particularly successful implementations

   ```bash
   wreckit learn --item 033
   ```

3. **Review tool warnings**: Check permission warnings to catch config errors

   ```bash
   wreckit learn --all 2>&1 | grep -i warning
   ```

4. **Iterate incrementally**: Start with recent items, expand to all over time

   ```bash
   # First: default (recent 5)
   wreckit learn

   # Then: all completed
   wreckit learn --all
   ```

5. **Backup before replace**: Save current skills before using replace strategy
   ```bash
   cp .wreckit/skills.json .wreckit/skills.json.backup
   wreckit learn --all --merge replace
   ```

## Troubleshooting

### No source items found

```
Warning: No source items found for pattern extraction
```

**Cause**: No items match the specified criteria.
**Solution**:

- Check that you have completed items with `wreckit list --state done`
- Use `--all` to include all completed items
- Use `--phase done` to explicitly filter for completed items

### Validation failed

```
Error: skills.json format validation failed: ...
```

**Cause**: Agent produced invalid output.
**Solution**:

- Try running again (agent behavior is non-deterministic)
- Manually review `.wreckit/skills.json` if it was created
- Check the learn prompt template for clarity

### Tool permission violations

```
Warning: Skill '...' requests tools not allowed in '...' phase: ...
```

**Cause**: Skill requests tools not available in the target phase.
**Solution**:

- Review the skill definition manually
- Adjust the skill's tools or phase assignment
- Ensure the skill is only used in appropriate phases

### Missing skills.json (not an error)

```
No existing skills.json (will create new file)
```

**Cause**: No existing skills file (first run).
**Solution**: This is normal! The command will create a new file.

### Merge strategy not implemented

```
Error: Interactive 'ask' merge strategy not yet implemented. Use 'append' or 'replace'.
```

**Cause**: Tried to use `--merge ask` which isn't implemented yet.
**Solution**: Use `--merge append` or `--merge replace`.

### Agent timeout

```
Error: Agent timed out during pattern extraction
```

**Cause**: Agent took too long to analyze items.
**Solution**:

- Reduce source items (use `--item` instead of `--all`)
- Increase timeout in config.json
- Try again (agent behavior varies)

## Advanced Usage

### Custom Skills for Specific Workflows

Create specialized skill sets for different types of work:

```bash
# Skills for documentation tasks
wreckit learn --phase documented --output .wreckit/doc-skills.json

# Skills for implementation tasks
wreckit learn --phase done --output .wreckit/impl-skills.json

# Skills for a specific campaign
wreckit learn --item 033 --item 034 --output .wreckit/m4-skills.json
```

### Incremental Learning

Build up skills gradually over time:

```bash
# Learn from most recent work
wreckit learn

# Later: learn from more items
wreckit learn --all

# Even later: refresh with replace
wreckit learn --all --merge replace
```

### Manual Skill Refinement

After extraction, manually refine skills:

```bash
# 1. Extract patterns
wreckit learn --all

# 2. Review and edit
vim .wreckit/skills.json

# 3. Test in workflow
wreckit run 035
```

## Related Commands

- `wreckit list`: View all items and their states
- `wreckit show <id>`: View details of a specific item
- `wreckit run <id>`: Test skills in a real workflow
- `wreckit doctor`: Validate items and fix broken state

## See Also

- [Skills Documentation](skills.md) - Complete guide to skill system
- [Agent Guidelines](AGENTS.md) - Agent patterns and MCP usage
- [Item 033](.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/) - Skill loading implementation
