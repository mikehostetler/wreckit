# Implementation Phase

## Task

Implement the user stories for this item.

## Item Details

- **ID:** {{id}}
- **Title:** {{title}}
- **Section:** {{section}}
- **Overview:** {{overview}}
- **Branch:** {{branch_name}}
- **Base Branch:** {{base_branch}}

{{#if scope_limits}}
## Scope Limits
{{scope_limits}}
{{/if}}

## Research

{{research}}

## Implementation Plan

{{plan}}

## User Stories (PRD)

{{prd}}

## Progress Log

{{progress}}

## Instructions

1. Pick the highest priority pending story from the PRD
2. Implement the story following the plan
3. Ensure all acceptance criteria are met
4. Run relevant tests and quality checks
5. Commit changes with a descriptive message
6. Call the `update_story_status` tool with the story ID and status "done"
7. Append learnings/notes to {{item_path}}/progress.log
8. Repeat for remaining stories

## Working Directory

{{item_path}}

## Completion

When ALL stories have status "done", output the following signal:
{{completion_signal}}
