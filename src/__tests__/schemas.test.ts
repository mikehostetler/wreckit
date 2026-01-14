import { describe, it, expect } from "bun:test";
import {
  WorkflowStateSchema,
  StoryStatusSchema,
  ConfigSchema,
  ItemSchema,
  StorySchema,
  PrdSchema,
  IndexItemSchema,
  IndexSchema,
} from "../schemas";

describe("WorkflowStateSchema", () => {
  it("accepts valid states", () => {
    const states = ["raw", "researched", "planned", "implementing", "in_pr", "done"];
    for (const state of states) {
      expect(WorkflowStateSchema.parse(state)).toBe(state);
    }
  });

  it("rejects invalid state", () => {
    expect(() => WorkflowStateSchema.parse("invalid")).toThrow();
  });
});

describe("StoryStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(StoryStatusSchema.parse("pending")).toBe("pending");
    expect(StoryStatusSchema.parse("done")).toBe("done");
  });

  it("rejects invalid status", () => {
    expect(() => StoryStatusSchema.parse("in_progress")).toThrow();
  });
});

describe("ConfigSchema", () => {
  it("parses valid config from SPEC", () => {
    const config = {
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: {
        command: "amp",
        args: ["--dangerously-allow-all"],
        completion_signal: "<promise>COMPLETE</promise>",
      },
      max_iterations: 100,
      timeout_seconds: 3600,
    };
    const result = ConfigSchema.parse(config);
    expect(result).toMatchObject(config);
    expect(result.agent.mode).toBe("process");
  });

  it("applies defaults for optional fields", () => {
    const config = {
      agent: {
        command: "amp",
        args: [],
        completion_signal: "DONE",
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.schema_version).toBe(1);
    expect(result.base_branch).toBe("main");
    expect(result.branch_prefix).toBe("wreckit/");
    expect(result.max_iterations).toBe(100);
    expect(result.timeout_seconds).toBe(3600);
  });

  it("rejects missing agent config", () => {
    expect(() => ConfigSchema.parse({})).toThrow();
  });
});

describe("ItemSchema", () => {
  it("parses valid item from SPEC", () => {
    const item = {
      schema_version: 1,
      id: "section/001-slug",
      title: "Feature name",
      section: "section",
      state: "raw",
      overview: "Description",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
    };
    const result = ItemSchema.parse(item);
    expect(result).toEqual(item);
  });

  it("accepts item with string values for nullable fields", () => {
    const item = {
      schema_version: 1,
      id: "features/002-auth",
      title: "Auth Feature",
      section: "features",
      state: "in_pr",
      overview: "Add authentication",
      branch: "wreckit/002-auth",
      pr_url: "https://github.com/org/repo/pull/42",
      pr_number: 42,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
    };
    const result = ItemSchema.parse(item);
    expect(result.branch).toBe("wreckit/002-auth");
    expect(result.pr_number).toBe(42);
  });

  it("rejects invalid state value", () => {
    const item = {
      schema_version: 1,
      id: "section/001-slug",
      title: "Feature name",
      section: "section",
      state: "invalid_state",
      overview: "Description",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
    };
    expect(() => ItemSchema.parse(item)).toThrow();
  });

  it("rejects missing required fields", () => {
    const item = {
      schema_version: 1,
      id: "section/001-slug",
    };
    expect(() => ItemSchema.parse(item)).toThrow();
  });

  it("rejects invalid types", () => {
    const item = {
      schema_version: "not a number",
      id: "section/001-slug",
      title: "Feature name",
      section: "section",
      state: "raw",
      overview: "Description",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
    };
    expect(() => ItemSchema.parse(item)).toThrow();
  });
});

describe("StorySchema", () => {
  it("parses valid story from SPEC", () => {
    const story = {
      id: "US-001",
      title: "Story title",
      acceptance_criteria: ["Criterion 1", "Criterion 2"],
      priority: 1,
      status: "pending",
      notes: "",
    };
    const result = StorySchema.parse(story);
    expect(result).toEqual(story);
  });

  it("rejects invalid status value", () => {
    const story = {
      id: "US-001",
      title: "Story title",
      acceptance_criteria: ["Criterion 1"],
      priority: 1,
      status: "in_progress",
      notes: "",
    };
    expect(() => StorySchema.parse(story)).toThrow();
  });

  it("rejects missing required fields", () => {
    const story = {
      id: "US-001",
      title: "Story title",
    };
    expect(() => StorySchema.parse(story)).toThrow();
  });

  it("rejects invalid types", () => {
    const story = {
      id: "US-001",
      title: "Story title",
      acceptance_criteria: "not an array",
      priority: 1,
      status: "pending",
      notes: "",
    };
    expect(() => StorySchema.parse(story)).toThrow();
  });
});

describe("PrdSchema", () => {
  it("parses valid prd from SPEC", () => {
    const prd = {
      schema_version: 1,
      id: "section/001-slug",
      branch_name: "wreckit/001-slug",
      user_stories: [
        {
          id: "US-001",
          title: "Story title",
          acceptance_criteria: ["Criterion 1", "Criterion 2"],
          priority: 1,
          status: "pending",
          notes: "",
        },
      ],
    };
    const result = PrdSchema.parse(prd);
    expect(result).toEqual(prd);
  });

  it("rejects invalid story in user_stories", () => {
    const prd = {
      schema_version: 1,
      id: "section/001-slug",
      branch_name: "wreckit/001-slug",
      user_stories: [
        {
          id: "US-001",
          title: "Story title",
          acceptance_criteria: ["Criterion 1"],
          priority: 1,
          status: "invalid_status",
          notes: "",
        },
      ],
    };
    expect(() => PrdSchema.parse(prd)).toThrow();
  });
});

describe("IndexItemSchema", () => {
  it("parses valid index item from SPEC", () => {
    const indexItem = {
      id: "foundation/001-core-types",
      state: "raw",
      title: "Core Types",
    };
    const result = IndexItemSchema.parse(indexItem);
    expect(result).toEqual(indexItem);
  });

  it("rejects invalid state", () => {
    const indexItem = {
      id: "foundation/001-core-types",
      state: "invalid",
      title: "Core Types",
    };
    expect(() => IndexItemSchema.parse(indexItem)).toThrow();
  });
});

describe("IndexSchema", () => {
  it("parses valid index from SPEC", () => {
    const index = {
      schema_version: 1,
      items: [
        { id: "foundation/001-core-types", state: "raw", title: "Core Types" },
      ],
      generated_at: "2025-01-12T00:00:00Z",
    };
    const result = IndexSchema.parse(index);
    expect(result).toEqual(index);
  });

  it("rejects missing required fields", () => {
    const index = {
      schema_version: 1,
      items: [],
    };
    expect(() => IndexSchema.parse(index)).toThrow();
  });

  it("rejects invalid item in items array", () => {
    const index = {
      schema_version: 1,
      items: [{ id: "test", state: "bad_state", title: "Test" }],
      generated_at: "2025-01-12T00:00:00Z",
    };
    expect(() => IndexSchema.parse(index)).toThrow();
  });
});
