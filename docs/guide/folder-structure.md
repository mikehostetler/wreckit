# Folder Structure

Understanding the .wreckit directory structure.

## Directory Layout

```
.wreckit/
├── config.json              # Global config
├── index.json               # Registry of all items
├── prompts/                 # Customizable prompt templates
│   ├── research.md
│   ├── plan.md
│   └── implement.md
└── <section>/
    └── <nnn>-<slug>/
        ├── item.json        # State and metadata
        ├── research.md      # Codebase analysis
        ├── plan.md          # Implementation plan
        ├── prd.json         # User stories
        ├── prompt.md        # Generated agent prompt
        └── progress.log     # What the agent learned
```

## Top-Level Files

### config.json
Global configuration for your Wreckit setup. See [Configuration](/guide/configuration) for details.

### index.json
Registry of all items in the system. Tracks item IDs, states, and metadata.

### prompts/
Customizable prompt templates that control agent behavior:
- `research.md` — How the agent analyzes your codebase
- `plan.md` — How it designs solutions
- `implement.md` — How it executes user stories

See [Customization](/agent-development/customization) for details.

## Item Directories

Items are organized by section (e.g., `features/`, `bugs/`, `infra/`) with sequential numbering.

Each item directory contains:

### item.json
State and metadata for the item:
- Current state (raw, researched, planned, implementing, in_pr, done)
- Title and description
- Creation timestamp
- Branch name

### research.md
Agent's analysis of your codebase:
- File paths to modify
- Conventions to follow
- Integration points
- Technical considerations

### plan.md
Agent's implementation plan:
- Approach overview
- Phases with success criteria
- Architecture decisions

### prd.json
User stories with acceptance criteria:
- Story IDs
- Titles and descriptions
- Priority
- Status (pending/done)

### prompt.md
Generated prompt sent to the agent for implementation phase.

### progress.log
What the agent learned during implementation:
- Commands run
- Tests executed
- Decisions made
- Errors encountered

## Sections

Items are organized into sections by type:

- `features/` - New features and enhancements
- `bugs/` - Bug fixes
- `infra/` - Infrastructure and tooling
- `docs/` - Documentation improvements
- `refactor/` - Code refactoring
- `tests/` - Test improvements

Section names are customizable. Choose whatever works for your project.

Previous: [The Loop](/guide/loop) | Next: [Design Principles](/guide/design-principles)
