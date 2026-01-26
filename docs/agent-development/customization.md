# Customization

Custom prompts and templates.

## Overview

Wreckit is designed to be customizable. You can modify agent behavior by editing prompt templates and configuration files.

## Prompt Templates

Edit files in `.wreckit/prompts/` to customize agent behavior:

- `research.md` — How the agent analyzes your codebase
- `plan.md` — How it designs solutions
- `implement.md` — How it executes user stories

These templates are used during each phase of the workflow. Modifying them changes how the agent thinks and acts.

### Research Template (research.md)

Controls how the agent:
- Scans your codebase
- Identifies patterns and conventions
- Documents file paths and integration points
- Writes the research.md file for each item

**Customize when:**
- You want different analysis depth
- You want to focus on specific aspects of code
- You want to change documentation format

### Plan Template (plan.md)

Controls how the agent:
- Designs the implementation approach
- Breaks work into phases
- Creates user stories with acceptance criteria
- Writes the plan.md and prd.json files

**Customize when:**
- You want different planning approach
- You want to change user story format
- You want different acceptance criteria style

### Implement Template (implement.md)

Controls how the agent:
- Executes user stories
- Makes code changes
- Runs tests
- Commits changes
- Updates progress.log

**Customize when:**
- You want different coding style
- You want different commit message format
- You want to add additional steps

## Template Variables

Prompt templates have access to these variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{id}}` | Item ID | `features/001-dark-mode` |
| `{{title}}` | Item title | `Add dark mode toggle` |
| `{{section}}` | Section name | `features` |
| `{{overview}}` | Item description | `Add dark mode to the app` |
| `{{item_path}}` | Path to item folder | `.wreckit/items/features/001-dark-mode/` |
| `{{branch_name}}` | Git branch name | `wreckit/features/001-dark-mode` |
| `{{base_branch}}` | Base branch | `main` |
| `{{completion_signal}}` | Agent completion signal | `<promise>COMPLETE</promise>` |
| `{{research}}` | Contents of research.md | (full markdown content) |
| `{{plan}}` | Contents of plan.md | (full markdown content) |
| `{{prd}}` | Contents of prd.json | (JSON string) |
| `{{progress}}` | Contents of progress.log | (log content) |

### Using Variables

Variables are substituted at runtime. Use them in your templates:

```markdown
# Research Plan for {{title}}

**Item ID:** {{id}}
**Section:** {{section}}

## Overview
{{overview}}

## Instructions
Research the codebase and document:
1. File paths to modify
2. Conventions to follow
3. Integration points

Base branch: {{base_branch}}
Working branch: {{branch_name}}
```

## Testing Customizations

After customizing templates:

1. **Test in isolation:**
   ```bash
   wreckit run 1 --dry-run
   ```

2. **Review generated artifacts:**
   ```bash
   cat .wreckit/items/features/001-*/research.md
   cat .wreckit/items/features/001-*/plan.md
   ```

3. **Run with verbose logging:**
   ```bash
   wreckit run 1 --verbose
   ```

## Best Practices

1. **Start small** - Make incremental changes to templates
2. **Test thoroughly** - Use `--dry-run` before full execution
3. **Review artifacts** - Check research.md, plan.md before implementation
4. **Version control** - Commit prompt templates like code
5. **Document changes** - Add comments in templates explaining customizations
6. **Share with team** - Commit templates to repo so everyone benefits

[Back to Agent Development](/agent-development/)
