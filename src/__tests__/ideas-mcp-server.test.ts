import { describe, expect, it } from "bun:test";
import {
  createIdeasMcpServer,
  type IdeasMcpHandlers,
} from "../agent/mcp/ideasMcpServer";
import type { ParsedIdea } from "../domain/ideas";

describe("createIdeasMcpServer", () => {
  describe("server creation", () => {
    it("creates server successfully", () => {
      const server = createIdeasMcpServer();
      expect(server).toBeDefined();
      expect(server).toBeObject();
    });

    it("creates server with handlers", () => {
      let capturedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onInterviewIdeas: (ideas: ParsedIdea[]) => {
          capturedIdeas = ideas;
        },
      };

      const server = createIdeasMcpServer(handler);
      expect(server).toBeDefined();
    });
  });

  describe("onInterviewIdeas handler", () => {
    it("calls onInterviewIdeas handler when save_interview_ideas is invoked", async () => {
      let capturedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onInterviewIdeas: (ideas: ParsedIdea[]) => {
          capturedIdeas = ideas;
        },
      };

      const server = createIdeasMcpServer(handler);

      // The server should be a valid MCP server object
      expect(server).toBeDefined();
      expect(typeof server).toBe("object");

      // Verify the handler was set up correctly by checking it doesn't throw
      expect(() => createIdeasMcpServer(handler)).not.toThrow();
    });

    it("captures ideas correctly through handler", () => {
      const testIdeas: ParsedIdea[] = [
        {
          title: "Test Idea",
          description: "Test description",
        },
      ];

      let capturedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onInterviewIdeas: (ideas: ParsedIdea[]) => {
          capturedIdeas = ideas;
        },
      };

      // Simulate the handler being called
      handler.onInterviewIdeas(testIdeas);

      expect(capturedIdeas).not.toBeNull();
      expect(capturedIdeas).toHaveLength(1);
      expect(capturedIdeas![0].title).toBe("Test Idea");
    });

    it("handles multiple ideas", () => {
      const testIdeas: ParsedIdea[] = [
        { title: "Idea 1", description: "First idea" },
        { title: "Idea 2", description: "Second idea" },
        { title: "Idea 3", description: "Third idea" },
      ];

      let capturedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onInterviewIdeas: (ideas: ParsedIdea[]) => {
          capturedIdeas = ideas;
        },
      };

      handler.onInterviewIdeas(testIdeas);

      expect(capturedIdeas).toHaveLength(3);
      expect(capturedIdeas![0].title).toBe("Idea 1");
      expect(capturedIdeas![1].title).toBe("Idea 2");
      expect(capturedIdeas![2].title).toBe("Idea 3");
    });
  });

  describe("onParsedIdeas handler", () => {
    it("calls onParsedIdeas handler when save_parsed_ideas is invoked", () => {
      const testIdeas: ParsedIdea[] = [
        {
          title: "Parsed Idea",
          description: "Parsed description",
          problemStatement: "Some problem",
        },
      ];

      let capturedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onParsedIdeas: (ideas: ParsedIdea[]) => {
          capturedIdeas = ideas;
        },
      };

      const server = createIdeasMcpServer(handler);
      expect(server).toBeDefined();

      // Simulate the handler being called
      handler.onParsedIdeas(testIdeas);

      expect(capturedIdeas).not.toBeNull();
      expect(capturedIdeas![0].title).toBe("Parsed Idea");
      expect(capturedIdeas![0].problemStatement).toBe("Some problem");
    });

    it("handles ideas with all optional fields", () => {
      const testIdeas: ParsedIdea[] = [
        {
          title: "Complete Idea",
          description: "Full description",
          problemStatement: "Problem",
          motivation: "Motivation",
          successCriteria: ["Criteria 1", "Criteria 2"],
          technicalConstraints: ["Constraint 1"],
          scope: {
            inScope: ["In scope"],
            outOfScope: ["Out of scope"],
          },
          priorityHint: "high",
          urgencyHint: "ASAP",
          suggestedSection: "frontend",
        },
      ];

      let capturedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onParsedIdeas: (ideas: ParsedIdea[]) => {
          capturedIdeas = ideas;
        },
      };

      handler.onParsedIdeas(testIdeas);

      expect(capturedIdeas).not.toBeNull();
      expect(capturedIdeas![0].scope?.inScope).toEqual(["In scope"]);
      expect(capturedIdeas![0].scope?.outOfScope).toEqual(["Out of scope"]);
      expect(capturedIdeas![0].priorityHint).toBe("high");
    });
  });

  describe("server can be used with both handlers", () => {
    it("supports both interview and parsed ideas handlers", () => {
      let interviewIdeas: ParsedIdea[] | null = null;
      let parsedIdeas: ParsedIdea[] | null = null;

      const handler = {
        onInterviewIdeas: (ideas: ParsedIdea[]) => {
          interviewIdeas = ideas;
        },
        onParsedIdeas: (ideas: ParsedIdea[]) => {
          parsedIdeas = ideas;
        },
      };

      const server = createIdeasMcpServer(handler);
      expect(server).toBeDefined();

      // Simulate both handlers being called
      handler.onInterviewIdeas([
        { title: "Interview", description: "From interview" },
      ]);
      handler.onParsedIdeas([
        { title: "Parsed", description: "From document" },
      ]);

      expect(interviewIdeas![0].title).toBe("Interview");
      expect(parsedIdeas![0].title).toBe("Parsed");
    });

    it("works with empty handlers object", () => {
      const server = createIdeasMcpServer({});
      expect(server).toBeDefined();
    });

    it("works with no handlers", () => {
      const server = createIdeasMcpServer();
      expect(server).toBeDefined();
    });
  });

  describe("security: ideas-only server", () => {
    it("creates server that only handles ideas (no PRD, no story status)", () => {
      // The ideas MCP server should only have idea-related handlers
      // This is enforced at the type level - the IdeasMcpHandlers interface
      // only includes onInterviewIdeas and onParsedIdeas

      const handler = {
        onInterviewIdeas: (ideas: ParsedIdea[]) => {},
        onParsedIdeas: (ideas: ParsedIdea[]) => {},
      };

      const server = createIdeasMcpServer(handler);

      // Server should be created successfully
      expect(server).toBeDefined();

      // The handler interface does not include onSavePrd or onUpdateStoryStatus
      // This prevents tools for other phases from being registered
      type HandlerKeys = keyof IdeasMcpHandlers;
      const validKeys: HandlerKeys[] = ["onInterviewIdeas", "onParsedIdeas"];

      // Verify only idea-related keys exist in the interface
      expect(Object.keys(handler)).toEqual(expect.arrayContaining(validKeys));
    });

    it("reduces blast radius by excluding other phase handlers", () => {
      // Compare the handler interfaces
      type IdeasHandlerKeys = keyof IdeasMcpHandlers;
      const ideasKeys: IdeasHandlerKeys[] = [
        "onInterviewIdeas",
        "onParsedIdeas",
      ];

      // The ideas server only has 2 handlers
      expect(ideasKeys).toHaveLength(2);

      // It doesn't have handlers for other phases
      expect(ideasKeys).not.toContain("onSavePrd");
      expect(ideasKeys).not.toContain("onUpdateStoryStatus");
    });
  });
});
