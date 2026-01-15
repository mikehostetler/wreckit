# PR Description Generation

You are tasked with generating a well-structured pull request description for this completed work item.

## Item Details
- **ID:** {{id}}
- **Title:** {{title}}
- **Section:** {{section}}
- **Overview:** {{overview}}
- **Branch:** {{branch_name}}
- **Base Branch:** {{base_branch}}

## Research Summary
{{research}}

## Implementation Plan
{{plan}}

## User Stories (PRD)
{{prd}}

## Progress Log
{{progress}}

## Instructions

Generate a PR description that:

1. **Title**: Follow conventional commits format (e.g., `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
   - Keep it concise but descriptive
   - Use imperative mood ("Add feature" not "Added feature")

2. **Body**: Create a well-structured markdown description including:
   - **Overview**: Brief summary of what this PR accomplishes
   - **Changes**: Summarize the key changes made (derived from completed user stories)
   - **Testing**: Notes on how to test the changes
   - **Breaking Changes**: List any breaking changes or migration steps (if applicable)

## Output Format

Output your response as a JSON object wrapped in markers for parsing:

```
PR_JSON_START
{"title": "feat: your concise pr title", "body": "## Overview\n\nYour overview here...\n\n## Changes\n\n- Change 1\n- Change 2\n\n## Testing\n\nHow to test...\n\n## Breaking Changes\n\nNone (or list them)"}
PR_JSON_END
```

## Guidelines

- Be concise but comprehensive
- Focus on the "what" and "why", not the "how"
- Use bullet points for readability
- Link to relevant issues if mentioned in the research/plan
- Keep the tone professional and informative
- Escape newlines as `\n` in the JSON body field
