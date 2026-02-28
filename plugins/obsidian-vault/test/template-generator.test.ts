import { describe, it, expect } from "bun:test";
import { generateTemplate } from "../src/lib/template-generator";
import type { FieldInfo } from "../src/lib/schema-introspector";

describe("generateTemplate", () => {
  it("should generate frontmatter with title using Obsidian variable", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain('title: "{{title}}"');
  });

  it("should set entityType to the literal entity type name", () => {
    const fields: FieldInfo[] = [
      {
        name: "entityType",
        type: "string",
        required: true,
        defaultValue: "post",
      },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain("entityType: post");
  });

  it("should set status enum to first value (draft)", () => {
    const fields: FieldInfo[] = [
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "queued", "published"],
      },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain("status: draft");
  });

  it("should set created/updated dates to Obsidian date variable", () => {
    const fields: FieldInfo[] = [
      { name: "created", type: "date", required: false },
      { name: "updated", type: "date", required: false },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain('created: "{{date}}"');
    expect(result).toContain('updated: "{{date}}"');
  });

  it("should set arrays to empty array", () => {
    const fields: FieldInfo[] = [
      { name: "tags", type: "array", required: false, defaultValue: [] },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain("tags: []");
  });

  it("should set booleans to their default or false", () => {
    const fields: FieldInfo[] = [
      {
        name: "embeddable",
        type: "boolean",
        required: false,
        defaultValue: true,
      },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain("embeddable: true");
  });

  it("should set optional strings to empty string", () => {
    const fields: FieldInfo[] = [
      { name: "slug", type: "string", required: false },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain('slug: ""');
  });

  it("should leave optional numbers empty", () => {
    const fields: FieldInfo[] = [
      { name: "seriesOrder", type: "number", required: false },
    ];
    const result = generateTemplate("post", fields);
    expect(result).toContain("seriesOrder:");
    // Should not have a value after the colon (just empty)
    const line = result.split("\n").find((l) => l.includes("seriesOrder"));
    expect(line?.trim()).toBe("seriesOrder:");
  });

  it("should produce valid YAML frontmatter delimiters", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateTemplate("post", fields);
    expect(result.startsWith("---\n")).toBe(true);
    expect(result).toContain("\n---\n");
  });

  it("should include placeholder for free-form entities", () => {
    const fields: FieldInfo[] = [];
    const result = generateTemplate("post", fields);
    expect(result).toContain("<!-- Write your content here -->");
  });

  it("should include body template when provided", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const bodyTemplate = "## Context\n\n## Problem\n\n## Solution\n";
    const result = generateTemplate("project", fields, bodyTemplate);
    expect(result).toContain("## Context");
    expect(result).toContain("## Problem");
    expect(result).toContain("## Solution");
  });

  it("should handle a full blog post schema", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
      { name: "slug", type: "string", required: false },
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "queued", "published"],
      },
      {
        name: "entityType",
        type: "string",
        required: true,
        defaultValue: "post",
      },
      { name: "tags", type: "array", required: false, defaultValue: [] },
      { name: "coverImage", type: "string", required: false },
      { name: "created", type: "date", required: false },
      { name: "updated", type: "date", required: false },
    ];
    const result = generateTemplate("post", fields);

    expect(result).toContain('title: "{{title}}"');
    expect(result).toContain('slug: ""');
    expect(result).toContain("status: draft");
    expect(result).toContain("entityType: post");
    expect(result).toContain("tags: []");
    expect(result).toContain('coverImage: ""');
    expect(result).toContain('created: "{{date}}"');
    expect(result).toContain('updated: "{{date}}"');
  });

  it("should use non-draft enum first value for non-status fields", () => {
    const fields: FieldInfo[] = [
      {
        name: "platform",
        type: "enum",
        required: true,
        enumValues: ["linkedin", "twitter"],
      },
    ];
    const result = generateTemplate("social-post", fields);
    expect(result).toContain("platform: linkedin");
  });
});
