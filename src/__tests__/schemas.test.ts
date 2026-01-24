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
  BatchProgressSchema,
} from "../schemas";

describe("WorkflowStateSchema", () => {
  it("accepts valid states", () => {
    const states = ["idea", "researched", "planned", "implementing", "in_pr", "done"];
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
  it("parses valid config from SPEC (legacy format)", () => {
    const config = {
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: {
        mode: "process",
        command: "amp",
        args: ["--dangerously-allow-all"],
        completion_signal: "<promise>COMPLETE</promise>",
      },
      max_iterations: 100,
      timeout_seconds: 3600,
    };
    const result = ConfigSchema.parse(config);
    expect(result).toMatchObject(config);
  });

  it("applies defaults for optional fields", () => {
    const config = {
      agent: {
        mode: "process",
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

  it("parses valid config from SPEC (new kind format)", () => {
    const config = {
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: {
        kind: "claude_sdk",
        model: "claude-sonnet-4",
        max_tokens: 4096,
      },
      max_iterations: 100,
      timeout_seconds: 3600,
    };
    const result = ConfigSchema.parse(config);
    expect(result).toMatchObject(config);
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
      state: "idea",
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
      state: "idea",
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

  it("accepts item with depends_on and campaign fields", () => {
    const item = {
      schema_version: 1,
      id: "002-feature",
      title: "Feature name",
      state: "idea",
      overview: "Description",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      depends_on: ["001-setup", "001-core"],
      campaign: "M1",
    };
    const result = ItemSchema.parse(item);
    expect(result.depends_on).toEqual(["001-setup", "001-core"]);
    expect(result.campaign).toBe("M1");
  });

  it("accepts item without depends_on and campaign fields (backwards compatibility)", () => {
    const item = {
      schema_version: 1,
      id: "001-feature",
      title: "Feature name",
      state: "idea",
      overview: "Description",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
    };
    const result = ItemSchema.parse(item);
    expect(result.depends_on).toBeUndefined();
    expect(result.campaign).toBeUndefined();
  });

  it("accepts item with empty depends_on array", () => {
    const item = {
      schema_version: 1,
      id: "001-feature",
      title: "Feature name",
      state: "idea",
      overview: "Description",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      depends_on: [],
    };
    const result = ItemSchema.parse(item);
    expect(result.depends_on).toEqual([]);
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
      state: "idea",
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

  it("accepts index item with depends_on field", () => {
    const indexItem = {
      id: "002-feature",
      state: "idea",
      title: "Feature",
      depends_on: ["001-setup"],
    };
    const result = IndexItemSchema.parse(indexItem);
    expect(result.depends_on).toEqual(["001-setup"]);
  });

  it("accepts index item without depends_on field (backwards compatibility)", () => {
    const indexItem = {
      id: "001-setup",
      state: "done",
      title: "Setup",
    };
    const result = IndexItemSchema.parse(indexItem);
    expect(result.depends_on).toBeUndefined();
  });
});

describe("IndexSchema", () => {
  it("parses valid index from SPEC", () => {
    const index = {
      schema_version: 1,
      items: [
        { id: "foundation/001-core-types", state: "idea", title: "Core Types" },
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

describe("BatchProgressSchema", () => {
  it("parses valid batch progress", () => {
    const progress = {
      schema_version: 1,
      session_id: "abc-123",
      pid: 12345,
      started_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      parallel: 1,
      queued_items: ["001-test", "002-test"],
      current_item: "001-test",
      completed: [],
      failed: [],
      skipped: [],
    };
    const result = BatchProgressSchema.parse(progress);
    expect(result).toEqual(progress);
  });

  it("accepts null for current_item", () => {
    const progress = {
      schema_version: 1,
      session_id: "abc-123",
      pid: 12345,
      started_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: ["001-done"],
      failed: [],
      skipped: ["002-skip"],
    };
    const result = BatchProgressSchema.parse(progress);
    expect(result.current_item).toBeNull();
    expect(result.completed).toEqual(["001-done"]);
    expect(result.skipped).toEqual(["002-skip"]);
  });

  it("rejects missing session_id", () => {
    const progress = {
      schema_version: 1,
      pid: 12345,
      started_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    expect(() => BatchProgressSchema.parse(progress)).toThrow();
  });

  it("rejects wrong schema_version", () => {
    const progress = {
      schema_version: 2,
      session_id: "abc-123",
      pid: 12345,
      started_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    expect(() => BatchProgressSchema.parse(progress)).toThrow();
  });

  it("rejects missing pid", () => {
    const progress = {
      schema_version: 1,
      session_id: "abc-123",
      started_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    expect(() => BatchProgressSchema.parse(progress)).toThrow();
  });

  it("rejects missing arrays", () => {
    const progress = {
      schema_version: 1,
      session_id: "abc-123",
      pid: 12345,
      started_at: "2025-01-12T00:00:00Z",
      updated_at: "2025-01-12T00:00:00Z",
      parallel: 1,
      queued_items: [],
      current_item: null,
      // missing completed, failed, skipped
    };
    expect(() => BatchProgressSchema.parse(progress)).toThrow();
  });
});
