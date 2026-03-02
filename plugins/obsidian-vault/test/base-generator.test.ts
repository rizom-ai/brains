import { describe, it, expect } from "bun:test";
import {
  generateBase,
  generatePipelineBase,
  generateSettingsBase,
} from "../src/lib/base-generator";
import type { FieldInfo } from "../src/lib/schema-introspector";
import { fromYaml } from "@brains/utils";

describe("generateBase", () => {
  it("should filter by entity folder", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateBase("post", fields);
    expect(result.content).toContain('file.inFolder("post")');
  });

  it("should produce valid YAML without frontmatter delimiters", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateBase("post", fields);
    expect(result.content).not.toContain("---");
    const parsed = fromYaml(result.content);
    expect(parsed).toBeDefined();
  });

  it("should include all fields in column order", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
      { name: "slug", type: "string", required: false },
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "published"],
      },
    ];
    const result = generateBase("post", fields);
    expect(result.content).toContain("file.name");
    expect(result.content).toContain("- title");
    expect(result.content).toContain("- slug");
    expect(result.content).toContain("- status");
  });

  it("should exclude entityType from column order", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
      {
        name: "entityType",
        type: "string",
        required: true,
        defaultValue: "post",
      },
    ];
    const result = generateBase("post", fields);
    const parsed = fromYaml<{
      views: { order: string[] }[];
    }>(result.content);
    const firstView = parsed.views[0];
    expect(firstView?.order).not.toContain("entityType");
  });

  it("should add grouped-by-status view when status field exists", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "queued", "published"],
      },
    ];
    const result = generateBase("post", fields);
    const parsed = fromYaml<{
      views: { name: string; groupBy?: unknown }[];
    }>(result.content);
    expect(parsed.views).toHaveLength(2);
    const statusView = parsed.views[1];
    expect(statusView?.name).toBe("By Status");
    expect(statusView?.groupBy).toBeDefined();
  });

  it("should not add grouped-by-status view when no status field", () => {
    const fields: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    const result = generateBase("topic", fields);
    const parsed = fromYaml<{ views: unknown[] }>(result.content);
    expect(parsed.views).toHaveLength(1);
  });

  it("should return human-friendly filename", () => {
    expect(
      generateBase("post", [{ name: "title", type: "string", required: true }])
        .filename,
    ).toBe("Posts.base");
    expect(
      generateBase("social-post", [
        { name: "title", type: "string", required: true },
      ]).filename,
    ).toBe("Social Posts.base");
    expect(
      generateBase("series", [
        { name: "title", type: "string", required: true },
      ]).filename,
    ).toBe("Series.base");
  });

  it("should use 'Notes' for the base entity type", () => {
    const result = generateBase("base", [
      { name: "title", type: "string", required: true },
    ]);
    expect(result.filename).toBe("Notes.base");
    expect(result.content).toContain("All Notes");
  });

  it("should filter for root-level files for the base entity type", () => {
    const result = generateBase("base", [
      { name: "title", type: "string", required: true },
    ]);
    expect(result.content).not.toContain("file.inFolder");
    expect(result.content).toContain('file.folder == "/"');
  });

  it("should report hasStatus correctly", () => {
    const withStatus: FieldInfo[] = [
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "published"],
      },
    ];
    const without: FieldInfo[] = [
      { name: "title", type: "string", required: true },
    ];
    expect(generateBase("post", withStatus).hasStatus).toBe(true);
    expect(generateBase("topic", without).hasStatus).toBe(false);
  });
});

describe("generatePipelineBase", () => {
  it("should combine multiple entity types with or-clause", () => {
    const entries = [
      {
        entityType: "post",
        fields: [
          {
            name: "status",
            type: "enum" as const,
            required: true,
            enumValues: ["draft", "published"],
          },
        ],
      },
      {
        entityType: "social-post",
        fields: [
          {
            name: "status",
            type: "enum" as const,
            required: true,
            enumValues: ["draft", "published"],
          },
        ],
      },
    ];
    const result = generatePipelineBase(entries);
    expect(result).toContain('file.inFolder("post")');
    expect(result).toContain('file.inFolder("social-post")');
  });

  it("should filter for non-published status", () => {
    const entries = [
      {
        entityType: "post",
        fields: [
          {
            name: "status",
            type: "enum" as const,
            required: true,
            enumValues: ["draft", "published"],
          },
        ],
      },
    ];
    const result = generatePipelineBase(entries);
    expect(result).toContain('status != "published"');
  });

  it("should group by status", () => {
    const entries = [
      {
        entityType: "post",
        fields: [
          {
            name: "status",
            type: "enum" as const,
            required: true,
            enumValues: ["draft", "published"],
          },
        ],
      },
    ];
    const result = generatePipelineBase(entries);
    expect(result).toContain("property: status");
  });

  it("should include file.folder in column order", () => {
    const entries = [
      {
        entityType: "post",
        fields: [
          {
            name: "status",
            type: "enum" as const,
            required: true,
            enumValues: ["draft", "published"],
          },
        ],
      },
    ];
    const result = generatePipelineBase(entries);
    expect(result).toContain("file.folder");
  });

  it("should return null when no entries", () => {
    expect(generatePipelineBase([])).toBeNull();
  });

  it("should skip or-clause for single entity type", () => {
    const entries = [
      {
        entityType: "post",
        fields: [
          {
            name: "status",
            type: "enum" as const,
            required: true,
            enumValues: ["draft", "published"],
          },
        ],
      },
    ];
    const result = generatePipelineBase(entries);
    expect(result).not.toBeNull();
    const parsed = fromYaml<{ filters: { and: unknown[] } }>(result as string);
    const firstFilter = parsed.filters.and[0];
    // Single type should not need an or-clause
    expect(firstFilter).toBe('file.inFolder("post")');
  });
});

describe("generateSettingsBase", () => {
  it("should combine multiple singleton types with or-clause", () => {
    const entries = ["brain-character", "anchor-profile", "site-info"];
    const result = generateSettingsBase(entries);
    expect(result).not.toBeNull();
    expect(result).toContain('file.inFolder("brain-character")');
    expect(result).toContain('file.inFolder("anchor-profile")');
    expect(result).toContain('file.inFolder("site-info")');
  });

  it("should produce valid YAML", () => {
    const entries = ["brain-character", "site-info"];
    const result = generateSettingsBase(entries);
    expect(result).not.toBeNull();
    const parsed = fromYaml(result as string);
    expect(parsed).toBeDefined();
  });

  it("should include generic columns", () => {
    const entries = ["brain-character"];
    const result = generateSettingsBase(entries);
    expect(result).not.toBeNull();
    expect(result).toContain("file.name");
    expect(result).toContain("file.folder");
  });

  it("should return null when no entries", () => {
    expect(generateSettingsBase([])).toBeNull();
  });

  it("should skip or-clause for single singleton type", () => {
    const entries = ["site-info"];
    const result = generateSettingsBase(entries);
    expect(result).not.toBeNull();
    const parsed = fromYaml<{ filters: { and: unknown[] } }>(result as string);
    const firstFilter = parsed.filters.and[0];
    expect(firstFilter).toBe('file.inFolder("site-info")');
  });

  it("should use Settings as the view name", () => {
    const entries = ["brain-character"];
    const result = generateSettingsBase(entries);
    expect(result).toContain("name: Settings");
  });
});
