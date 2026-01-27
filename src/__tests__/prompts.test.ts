import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadPromptTemplate,
  renderPrompt,
  initPromptTemplates,
  getDefaultTemplate,
  type PromptVariables,
  type PromptName,
} from "../prompts";

describe("loadPromptTemplate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-prompts-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns custom template if exists in .wreckit/prompts/", async () => {
    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const customContent = "# Custom Research Template\n{{id}}";
    await fs.writeFile(path.join(promptsDir, "research.md"), customContent);

    const result = await loadPromptTemplate(tempDir, "research");

    expect(result).toBe(customContent);
  });

  it("returns default template if custom doesn't exist", async () => {
    const result = await loadPromptTemplate(tempDir, "research");
    const defaultTemplate = await getDefaultTemplate("research");

    expect(result).toBe(defaultTemplate);
  });

  it("works for all template names", async () => {
    const names: PromptName[] = [
      "research",
      "plan",
      "implement",
      "ideas",
      "pr",
    ];

    for (const name of names) {
      const result = await loadPromptTemplate(tempDir, name);
      const defaultTemplate = await getDefaultTemplate(name);
      expect(result).toBe(defaultTemplate);
    }
  });
});

describe("renderPrompt", () => {
  const baseVariables: PromptVariables = {
    id: "features/001-dark-mode",
    title: "Dark Mode Support",
    section: "features",
    overview: "Add dark mode support to the application",
    item_path: "/project/.wreckit/features/001-dark-mode",
    branch_name: "wreckit/001-dark-mode",
    base_branch: "main",
    completion_signal: "<promise>COMPLETE</promise>",
  };

  it("replaces single variable", () => {
    const template = "Item ID: {{id}}";
    const result = renderPrompt(template, baseVariables);

    expect(result).toBe("Item ID: features/001-dark-mode");
  });

  it("replaces multiple variables", () => {
    const template = "{{title}} in {{section}} on branch {{branch_name}}";
    const result = renderPrompt(template, baseVariables);

    expect(result).toBe(
      "Dark Mode Support in features on branch wreckit/001-dark-mode",
    );
  });

  it("replaces same variable multiple times", () => {
    const template = "ID: {{id}}, again: {{id}}, once more: {{id}}";
    const result = renderPrompt(template, baseVariables);

    expect(result).toBe(
      "ID: features/001-dark-mode, again: features/001-dark-mode, once more: features/001-dark-mode",
    );
  });

  it("handles missing optional variables by replacing with empty string", () => {
    const template = "Research: {{research}}, Plan: {{plan}}";
    const result = renderPrompt(template, baseVariables);

    expect(result).toBe("Research: , Plan: ");
  });

  it("handles optional variables when provided", () => {
    const variables: PromptVariables = {
      ...baseVariables,
      research: "# Research findings\nSome content",
      plan: "# Implementation plan\nStep 1...",
    };
    const template = "Research:\n{{research}}\n\nPlan:\n{{plan}}";
    const result = renderPrompt(template, variables);

    expect(result).toBe(
      "Research:\n# Research findings\nSome content\n\nPlan:\n# Implementation plan\nStep 1...",
    );
  });

  it("handles special characters in values", () => {
    const variables: PromptVariables = {
      ...baseVariables,
      title: "Fix $100 bug & <html> issues",
      overview: "Handle regex patterns like /\\w+/ and {brackets}",
    };
    const template = "Title: {{title}}\nOverview: {{overview}}";
    const result = renderPrompt(template, variables);

    expect(result).toBe(
      "Title: Fix $100 bug & <html> issues\nOverview: Handle regex patterns like /\\w+/ and {brackets}",
    );
  });

  it("leaves unknown variables as-is", () => {
    const template = "Known: {{id}}, Unknown: {{unknown_var}}";
    const result = renderPrompt(template, baseVariables);

    expect(result).toBe(
      "Known: features/001-dark-mode, Unknown: {{unknown_var}}",
    );
  });
});

describe("initPromptTemplates", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-init-prompts-test-"),
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates prompts directory", async () => {
    await initPromptTemplates(tempDir);

    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    const stat = await fs.stat(promptsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates all template files", async () => {
    await initPromptTemplates(tempDir);

    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    const files = await fs.readdir(promptsDir);

    expect(files).toContain("research.md");
    expect(files).toContain("plan.md");
    expect(files).toContain("implement.md");
    expect(files).toContain("ideas.md");
    expect(files).toContain("pr.md");

    const researchContent = await fs.readFile(
      path.join(promptsDir, "research.md"),
      "utf-8",
    );
    const defaultResearch = await getDefaultTemplate("research");
    expect(researchContent).toBe(defaultResearch);

    const planContent = await fs.readFile(
      path.join(promptsDir, "plan.md"),
      "utf-8",
    );
    const defaultPlan = await getDefaultTemplate("plan");
    expect(planContent).toBe(defaultPlan);

    const implementContent = await fs.readFile(
      path.join(promptsDir, "implement.md"),
      "utf-8",
    );
    const defaultImplement = await getDefaultTemplate("implement");
    expect(implementContent).toBe(defaultImplement);

    const ideasContent = await fs.readFile(
      path.join(promptsDir, "ideas.md"),
      "utf-8",
    );
    const defaultIdeas = await getDefaultTemplate("ideas");
    expect(ideasContent).toBe(defaultIdeas);

    const prContent = await fs.readFile(
      path.join(promptsDir, "pr.md"),
      "utf-8",
    );
    const defaultPr = await getDefaultTemplate("pr");
    expect(prContent).toBe(defaultPr);
  });

  it("doesn't overwrite existing templates", async () => {
    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    const customContent = "# My Custom Research Template";
    await fs.writeFile(path.join(promptsDir, "research.md"), customContent);

    await initPromptTemplates(tempDir);

    const researchContent = await fs.readFile(
      path.join(promptsDir, "research.md"),
      "utf-8",
    );
    expect(researchContent).toBe(customContent);

    const planContent = await fs.readFile(
      path.join(promptsDir, "plan.md"),
      "utf-8",
    );
    const defaultPlan = await getDefaultTemplate("plan");
    expect(planContent).toBe(defaultPlan);
  });
});

describe("getDefaultTemplate", () => {
  it("returns correct template for each name", async () => {
    const research = await getDefaultTemplate("research");
    expect(research).toContain("# Research Phase");

    const plan = await getDefaultTemplate("plan");
    expect(plan).toContain("# Planning Phase");

    const implement = await getDefaultTemplate("implement");
    expect(implement).toContain("# Implementation Phase");

    const ideas = await getDefaultTemplate("ideas");
    expect(ideas).toContain("# Ideas Parsing");

    const pr = await getDefaultTemplate("pr");
    expect(pr).toContain("# PR Description Generation");
  });
});
