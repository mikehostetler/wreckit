import { describe, it, expect } from "bun:test";
import {
  validateResearchQuality,
  type ResearchQualityResult,
  type ResearchQualityOptions,
} from "../domain/validation";

describe("Research Quality Validation (Gap 2)", () => {
  describe("validateResearchQuality", () => {
    const defaultOptions: ResearchQualityOptions = {
      minCitations: 5,
      minSummaryLength: 100,
      minAnalysisLength: 150,
      requiredSections: [
        "Header",
        "Research Question",
        "Summary",
        "Current State Analysis",
        "Key Files",
        "Technical Considerations",
        "Risks and Mitigations",
        "Recommended Approach",
        "Open Questions",
      ],
    };

    describe("citation density validation", () => {
      it("passes with sufficient file:line citations", () => {
        const content = `
# Research: Test Feature

## Research Question
Test question

## Summary
This is a summary with enough content to meet the minimum length requirement.
We need to investigate several files in the codebase to understand how
this feature should be implemented. The analysis includes multiple files
and provides detailed information about the current state.

## Current State Analysis

Found implementation in src/index.ts:42 where the main function is defined.
Also checked src/utils.ts:15 for helper functions.
The config is at src/config.json:10.
Tests are in src/__tests__/index.test.ts:5-25.
More details in src/workflow.ts:100-120.
Additional context from src/agent.ts:50.
And another reference in src/commands.ts:30.
Final reference in src/prompts.ts:75.
Tenth reference at src/errors.ts:20.

## Key Files
- src/index.ts:42
- src/utils.ts:15

## Technical Considerations
Technical details here

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk 1 | Mitigation 1 |

## Recommended Approach
Approach here

## Open Questions
Questions here
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.citations).toBeGreaterThanOrEqual(10);
        expect(result.errors).toEqual([]);
      });

      it("fails with insufficient citations", () => {
        const content = `
# Research: Test Feature

## Research Question
Test question

## Summary
${"A".repeat(200)}

## Current State Analysis

Only one citation at src/index.ts:42.

## Key Files
None

## Technical Considerations
Technical details

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk 1 | Mitigation 1 |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.citations).toBe(1);
        expect(result.errors.some((e) => e.includes("citation"))).toBe(true);
      });

      it("correctly counts various citation formats", () => {
        const content = `
# Research

## Research Question
How does the system work?

## Summary
${"A".repeat(200)}

## Current State Analysis

The current implementation is found in src/index.ts:42 where the main function starts.
Also checked src/utils.ts:15-20 for helper utilities.
Multiple references in src/config.json:10 for configuration settings.
At src/test.ts:5 for test cases.
In src/workflow.ts:100 for workflow logic.
And src/agent.ts:50 for agent handling.
Plus src/commands.ts:30 for command processing.
Also src/prompts.ts:75 for prompt templates.
And src/errors.ts:20 for error handling.
Finally src/main.ts:1 for the entry point.
These files collectively show the architecture.

## Key Files
List

## Technical Considerations
Tech

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.citations).toBe(10);
      });

      it("does not count citations without line numbers", () => {
        const content = `
# Research

## Summary
${"A".repeat(200)}

## Current State Analysis

Files at src/index.ts
And src/utils.ts
No line numbers here

## Key Files
List

## Technical Considerations
Tech

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.citations).toBe(0);
        expect(result.errors.some((e) => e.includes("citation"))).toBe(true);
      });
    });

    describe("required sections validation", () => {
      it("passes with all required sections present", () => {
        const content = `
# Header content

## Research Question
Question here

## Summary
${"A ".repeat(200)}

## Current State Analysis
Analysis shows the codebase structure with multiple important files.
The main implementation is in src/index.ts:42 and src/utils.ts:15.
Configuration is handled in src/config.json:10 with test coverage in src/test.ts:5.
The workflow is managed through src/workflow.ts:100 providing comprehensive analysis.

## Key Files
- File1
- File2

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.missingSections).toEqual([]);
      });

      it("fails with missing required sections", () => {
        const content = `
# Header

## Summary
${"A ".repeat(200)}

## Key Files
- File1

## Technical Considerations
Considerations
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.missingSections.length).toBeGreaterThan(0);
        expect(result.missingSections).toContain("Research Question");
        expect(result.missingSections).toContain("Current State Analysis");
        expect(result.missingSections).toContain("Risks and Mitigations");
        expect(result.missingSections).toContain("Recommended Approach");
        expect(result.missingSections).toContain("Open Questions");
      });

      it("allows case-insensitive section matching", () => {
        const content = `
# Research: Test

## research question
Question here

## SUMMARY
${"A ".repeat(200)}

## Current State Analysis
Citations found throughout the codebase show the implementation details.
Key files include src/index.ts:42 and src/utils.ts:15 for core functionality.
Configuration is in src/config.json:10 with tests at src/test.ts:5.
The workflow is managed through src/workflow.ts:100 providing complete analysis.

## Key Files
Files

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
      });
    });

    describe("minimum length validation", () => {
      it("passes with sufficient summary length", () => {
        const content = `
# Header

## Research Question
Question

## Summary
${"A ".repeat(200)}

## Current State Analysis
The analysis shows multiple citations throughout the codebase structure.
Key files are src/index.ts:42 and src/utils.ts:15 for implementation.
Configuration is at src/config.json:10 with tests in src/test.ts:5.
The workflow uses src/workflow.ts:100 for comprehensive processing.

## Key Files
Files

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.summaryLength).toBeGreaterThanOrEqual(200);
      });

      it("fails with insufficient summary length", () => {
        const content = `
# Header

## Research Question
Question

## Summary
Short summary.

## Current State Analysis
Citations: src/index.ts:42 src/utils.ts:15 src/config.json:10 src/test.ts:5 src/workflow.ts:100

## Key Files
Files

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.summaryLength).toBeLessThan(
          defaultOptions.minSummaryLength,
        );
        expect(result.errors.some((e) => e.includes("Summary"))).toBe(true);
      });

      it("fails with insufficient current state analysis", () => {
        const content = `
# Header

## Research Question
Question

## Summary
${"A ".repeat(200)}

## Current State Analysis
Brief analysis with only a few citations src/index.ts:42.

## Key Files
Files

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.errors.some(
            (e) => e.includes("Current State Analysis") || e.includes("length"),
          ),
        ).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("handles empty content gracefully", () => {
        const result = validateResearchQuality("", defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it("handles content with no sections", () => {
        const result = validateResearchQuality(
          "Just some text with no structure",
          defaultOptions,
        );
        expect(result.valid).toBe(false);
        expect(result.missingSections.length).toBe(
          defaultOptions.requiredSections.length,
        );
      });

      it("allows custom options", () => {
        const customOptions: ResearchQualityOptions = {
          minCitations: 2,
          minSummaryLength: 50,
          minAnalysisLength: 100,
          requiredSections: ["Summary", "Current State Analysis"],
        };

        const content = `
# Header

## Summary
${"A ".repeat(60)}

## Current State Analysis
Citations found at src/file.ts:42 and src/other.ts:10 showing implementation details.
This analysis provides sufficient information about the current state of the codebase.
The architecture and key components are documented here with proper references.

## Key Files
Files

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, customOptions);
        expect(result.valid).toBe(true);
      });

      it("handles malformed citations gracefully", () => {
        const content = `
# Header

## Research Question
Question

## Summary
${"A ".repeat(200)}

## Current State Analysis
Malformed citations like src/index.ts:, src/utils, :42 are ignored.
Properly formatted ones include src/test.ts:42 src/file.ts:10 src/main.ts:1.
Also src/config.ts:5 src/util.ts:20.
That's only 5 properly formatted citations which is the minimum.
These valid citations provide proper references throughout the analysis.

## Key Files
Files

## Technical Considerations
Considerations

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Risk | Mitigation |

## Recommended Approach
Approach

## Open Questions
Questions
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.citations).toBe(5); // Only properly formatted ones
      });
    });

    describe("real-world examples", () => {
      it("validates a minimal but acceptable research document", () => {
        const content = `# Research: Add Feature X

**Date**: 2025-01-19
**Item**: 001-add-feature-x

## Research Question
How should we implement feature X in the existing system?

## Summary

Feature X requires adding a new endpoint to the API and updating the frontend to display the new data. The current architecture uses a RESTful API pattern with TypeScript throughout.

The backend is organized around services in \`src/services/\`, with routing handled in \`src/index.ts\`. Frontend components are in \`src/components/\`. State management uses a custom hook pattern.

## Current State Analysis

The main entry point is at \`src/index.ts:42\` where the Express app is initialized. Routes are registered at \`src/routes/index.ts:15-30\`.

The service layer follows a pattern established in \`src/services/userService.ts:1-100\` which can serve as a template for the new feature service.

Database models are defined in \`src/models/index.ts:1-50\` using TypeScript interfaces.

Frontend components are organized in \`src/components/\` with the main app at \`src/App.tsx:10\`.

State management is handled by custom hooks in \`src/hooks/\`, see \`src/hooks/useData.ts:1-50\`.

API integration uses \`src/api/client.ts:20-40\`.

## Key Files

- \`src/index.ts:42\` - Main application entry
- \`src/routes/index.ts:15-30\` - Route registration
- \`src/services/userService.ts:1-100\` - Example service implementation
- \`src/models/index.ts:1-50\` - Database models
- \`src/App.tsx:10\` - Frontend app root

## Technical Considerations

The project uses:
- Express.js for backend routing
- TypeScript for type safety
- React for frontend
- Custom hooks for state management

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing API | High | Add versioning to new endpoints |
| Frontend state issues | Medium | Follow existing hook patterns |
| Database migration | Medium | Use incremental migration scripts |

## Recommended Approach

1. Create new service in \`src/services/featureXService.ts\` following the pattern from \`userService.ts\`
2. Add routes in \`src/routes/\` and register in \`src/routes/index.ts\`
3. Update database models in \`src/models/index.ts\`
4. Create frontend components in \`src/components/featureX/\`
5. Add custom hook in \`src/hooks/useFeatureX.ts\`
6. Integrate API calls using \`src/api/client.ts\`

## Open Questions

- Should the new endpoint use authentication? Current auth is at \`src/middleware/auth.ts:10-30\`
- Do we need database migrations or can we add columns directly?
- Should we add tests for the new service immediately?
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.citations).toBeGreaterThanOrEqual(12);
      });

      it("rejects a superficial research document", () => {
        const content = `# Research

## Research Question
How to add feature?

## Summary
Add a new feature to the app.

## Current State Analysis
The app exists.

## Key Files
Some files.

## Technical Considerations
Use TypeScript.

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Bugs | Tests |

## Recommended Approach
Write code.

## Open Questions
None.
`;

        const result = validateResearchQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });
});
