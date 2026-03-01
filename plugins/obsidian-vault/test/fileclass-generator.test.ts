import { describe, it, expect } from "bun:test";
import { generateFileClass } from "../src/lib/fileclass-generator";
import type { FieldInfo } from "../src/lib/schema-introspector";

describe("generateFileClass", () => {
  it("should generate Select field with options for enum", () => {
    const fields: FieldInfo[] = [
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "queued", "published"],
      },
    ];
    const result = generateFileClass(fields);
    expect(result).toContain("name: status");
    expect(result).toContain("type: Select");
    expect(result).toContain('"0": draft');
    expect(result).toContain('"1": queued');
    expect(result).toContain('"2": published');
  });

  it("should map string fields to Input type", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateFileClass(fields);
    expect(result).toContain("name: title");
    expect(result).toContain("type: Input");
  });

  it("should map number fields to Number type", () => {
    const fields: FieldInfo[] = [
      { name: "order", type: "number", required: false },
    ];
    const result = generateFileClass(fields);
    expect(result).toContain("name: order");
    expect(result).toContain("type: Number");
  });

  it("should map boolean fields to Boolean type", () => {
    const fields: FieldInfo[] = [
      { name: "embeddable", type: "boolean", required: false },
    ];
    const result = generateFileClass(fields);
    expect(result).toContain("name: embeddable");
    expect(result).toContain("type: Boolean");
  });

  it("should map date fields to Date type", () => {
    const fields: FieldInfo[] = [
      { name: "created", type: "date", required: false },
    ];
    const result = generateFileClass(fields);
    expect(result).toContain("name: created");
    expect(result).toContain("type: Date");
  });

  it("should map array fields to Multi type", () => {
    const fields: FieldInfo[] = [
      { name: "tags", type: "array", required: false, defaultValue: [] },
    ];
    const result = generateFileClass(fields);
    expect(result).toContain("name: tags");
    expect(result).toContain("type: Multi");
  });

  it("should produce valid YAML frontmatter delimiters", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateFileClass(fields);
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.trimEnd().endsWith("---")).toBe(true);
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
      { name: "created", type: "date", required: false },
    ];
    const result = generateFileClass(fields);

    expect(result).toContain("name: title");
    expect(result).toContain("name: slug");
    expect(result).toContain("name: status");
    expect(result).toContain("name: entityType");
    expect(result).toContain("name: tags");
    expect(result).toContain("name: created");

    // Enum should have options
    expect(result).toContain('"0": draft');
    expect(result).toContain('"1": queued');
    expect(result).toContain('"2": published');
  });

  it("should handle empty fields array", () => {
    const result = generateFileClass([]);
    expect(result).toContain("fields:");
    expect(result.startsWith("---\n")).toBe(true);
  });
});
