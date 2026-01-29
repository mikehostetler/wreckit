# Learn Phase - Pattern Extraction

You are tasked with analyzing completed work to extract reusable patterns that can be compiled into Skill artifacts for the Wreckit autonomous agent system.

## Objective

Analyze the source items and extract patterns that can be packaged as reusable skills. Skills define:
- **Tools**: Which tools (Read, Write, Edit, Glob, Grep, Bash, MCP tools) are typically used together
- **Context requirements**: What files, git state, or artifacts are needed (optional)
- **Phase applicability**: Which workflow phase this pattern supports

## Source Context

{{source_items_context}}

## Current Skills

The system may have existing skills defined. Your task is to identify NEW patterns or improve upon existing ones. Do not duplicate skills that already exist unless you have a compelling reason to replace them.

## Extraction Process

### Step 1: Identify Patterns

For each source item, analyze:
1. **What tools were used?** Look at the artifacts (research.md, plan.md, implemented code)
2. **What context was needed?** Git status? Item metadata? Previous artifacts?
3. **What phase was this work in?** Research, plan, implement, PR, complete?

### Step 2: Cluster Similar Patterns

Group similar patterns into skills:
- **Code exploration**: Read-only analysis with Read, Glob, Grep
- **Documentation**: Creating plans with Read, Write, Edit
- **Implementation**: Full capability with all tools
- **Git operations**: Version control with Read, Glob, Grep, Bash
- **Verification**: Read-only checks and validation

### Step 3: Define Skills

For each skill, provide:

```json
{
  "id": "skill-unique-id",
  "name": "Human-Readable Skill Name",
  "description": "What this skill provides and when to use it. Be specific.",
  "tools": ["Read", "Grep"],
  "required_context": [
    {
      "type": "git_status",
      "description": "Current repository state"
    }
  ],
  "mcp_servers": {}
}
```

**Skill fields:**
- `id`: Unique identifier (kebab-case, e.g., "code-analysis", "test-generation")
- `name`: Human-readable name (e.g., "Code Analysis", "Test Generation")
- `description`: Clear explanation of what the skill does and when to use it
- `tools`: Array of tool names (Read, Write, Edit, Glob, Grep, Bash, mcp__wreckit__*)
- `required_context` (optional): Context requirements for JIT loading
  - `type`: "file", "git_status", "item_metadata", "phase_artifact"
  - `path`: (for file/phase_artifact) file path
  - `description`: What this context provides
- `mcp_servers` (optional): MCP server configuration (usually empty)

### Step 4: Map Skills to Phases

Create the `phase_skills` mapping:

```json
{
  "phase_skills": {
    "research": ["skill-id-1", "skill-id-2"],
    "plan": ["skill-id-3"],
    "implement": ["skill-id-4"],
    "pr": ["skill-id-5"],
    "complete": ["skill-id-6"]
  }
}
```

## Output

Write the complete skills configuration to `{{output_path}}`:

```json
{
  "phase_skills": {
    "research": ["skill-id-1", "skill-id-2"],
    "plan": ["skill-id-3"],
    "implement": ["skill-id-4"],
    "pr": ["skill-id-5"],
    "complete": ["skill-id-6"]
  },
  "skills": [
    {
      "id": "skill-id-1",
      "name": "Skill Name",
      "description": "What this skill does",
      "tools": ["Read", "Grep"],
      "required_context": [],
      "mcp_servers": {}
    }
  ]
}
```

## Guidelines

1. **Be Specific**: Skills should be focused and reusable. Avoid overly broad "do-everything" skills.
2. **Avoid Duplication**: Don't recreate skills that already exist unless improving them significantly.
3. **Respect Tool Boundaries**: Only use tools that are allowed in the target phase:
   - research: Read, Write, Glob, Grep
   - plan: Read, Write, Edit, Glob, Grep, mcp__wreckit__save_prd
   - implement: Read, Write, Edit, Glob, Grep, Bash, mcp__wreckit__update_story_status
   - pr: Read, Glob, Grep, Bash
   - complete: Read, Glob, Grep, mcp__wreckit__complete
4. **Document Clearly**: Descriptions should explain when to use the skill and what it provides.
5. **Test Reasonably**: Consider how the skill would be loaded and used in a workflow.

## Merge Strategy

The merge strategy is: **{{merge_strategy}}**

- **append**: Add new skills to existing skills, keep both phase_skills and skills merged
- **replace**: Replace entire skills.json with new definitions

## Completion

When you have extracted and written the skills configuration, output:

{{completion_signal}}
