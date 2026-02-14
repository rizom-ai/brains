import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import {
  zodFieldToCmsWidget,
  generateCmsConfig,
} from "../../src/lib/cms-config";

describe("zodFieldToCmsWidget", () => {
  it("should map z.string() to string widget", () => {
    const result = zodFieldToCmsWidget("title", z.string());
    expect(result.widget).toBe("string");
    expect(result.name).toBe("title");
    expect(result.label).toBe("Title");
  });

  it("should map z.string().datetime() to datetime widget", () => {
    const result = zodFieldToCmsWidget("publishedAt", z.string().datetime());
    expect(result.widget).toBe("datetime");
    expect(result.label).toBe("Published At");
  });

  it("should map z.number() to number widget", () => {
    const result = zodFieldToCmsWidget("year", z.number());
    expect(result.widget).toBe("number");
  });

  it("should map z.boolean() to boolean widget", () => {
    const result = zodFieldToCmsWidget("featured", z.boolean());
    expect(result.widget).toBe("boolean");
  });

  it("should map z.enum() to select widget with options", () => {
    const result = zodFieldToCmsWidget(
      "status",
      z.enum(["draft", "published"]),
    );
    expect(result.widget).toBe("select");
    expect(result.options).toEqual(["draft", "published"]);
  });

  it("should map z.array(z.string()) to list widget", () => {
    const result = zodFieldToCmsWidget("keywords", z.array(z.string()));
    expect(result.widget).toBe("list");
  });

  it("should map z.object() to object widget with nested fields", () => {
    const result = zodFieldToCmsWidget(
      "source",
      z.object({ ref: z.string(), label: z.string() }),
    );
    expect(result.widget).toBe("object");
    expect(result.fields).toHaveLength(2);
    expect(result.fields?.[0]?.name).toBe("ref");
    expect(result.fields?.[1]?.name).toBe("label");
  });

  it("should unwrap .optional() and set required: false", () => {
    const result = zodFieldToCmsWidget("slug", z.string().optional());
    expect(result.widget).toBe("string");
    expect(result.required).toBe(false);
  });

  it("should unwrap .default() and set default value", () => {
    const result = zodFieldToCmsWidget(
      "status",
      z.enum(["draft", "published"]).default("draft"),
    );
    expect(result.widget).toBe("select");
    expect(result.default).toBe("draft");
    expect(result.options).toEqual(["draft", "published"]);
  });

  it("should map description fields to text widget", () => {
    const result = zodFieldToCmsWidget("description", z.string());
    expect(result.widget).toBe("text");
  });

  it("should map excerpt fields to text widget", () => {
    const result = zodFieldToCmsWidget("excerpt", z.string());
    expect(result.widget).toBe("text");
  });

  it("should format camelCase names to labels", () => {
    const result = zodFieldToCmsWidget("coverImageId", z.string());
    expect(result.label).toBe("Cover Image Id");
  });

  it("should handle z.string().url() as string widget", () => {
    const result = zodFieldToCmsWidget("url", z.string().url());
    expect(result.widget).toBe("string");
  });

  it("should handle nested optional + default", () => {
    const result = zodFieldToCmsWidget(
      "status",
      z.enum(["draft", "queued", "published"]).default("draft").optional(),
    );
    expect(result.widget).toBe("select");
    expect(result.required).toBe(false);
    expect(result.default).toBe("draft");
  });
});

describe("generateCmsConfig", () => {
  const postFrontmatterSchema = z.object({
    title: z.string(),
    status: z.enum(["draft", "published"]),
    publishedAt: z.string().datetime().optional(),
  });

  const noteFrontmatterSchema = z.object({
    title: z.string().optional(),
  });

  function createMockAdapter(
    entityType: string,
    frontmatterSchema?: z.ZodObject<z.ZodRawShape>,
  ): { entityType: string; frontmatterSchema?: z.ZodObject<z.ZodRawShape> } {
    return {
      entityType,
      ...(frontmatterSchema && { frontmatterSchema }),
    };
  }

  it("should generate correct backend config", () => {
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: [],
      getAdapter: () => undefined,
    });

    expect(config.backend.name).toBe("github");
    expect(config.backend.repo).toBe("owner/repo");
    expect(config.backend.branch).toBe("main");
  });

  it("should include baseUrl when provided", () => {
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      baseUrl: "https://auth.example.com",
      entityTypes: [],
      getAdapter: () => undefined,
    });

    expect(config.backend.base_url).toBe("https://auth.example.com");
  });

  it("should generate one collection per entity type with frontmatterSchema", () => {
    const postAdapter = createMockAdapter("post", postFrontmatterSchema);
    const noteAdapter = createMockAdapter("note", noteFrontmatterSchema);

    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post", "note"],
      getAdapter: (type) => {
        if (type === "post") return postAdapter;
        if (type === "note") return noteAdapter;
        return undefined;
      },
    });

    expect(config.collections).toHaveLength(2);
    expect(config.collections[0]?.name).toBe("post");
    expect(config.collections[1]?.name).toBe("note");
  });

  it("should skip adapters without frontmatterSchema", () => {
    const postAdapter = createMockAdapter("post", postFrontmatterSchema);
    const imageAdapter = createMockAdapter("image"); // No frontmatterSchema

    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post", "image"],
      getAdapter: (type) => {
        if (type === "post") return postAdapter;
        if (type === "image") return imageAdapter;
        return undefined;
      },
    });

    expect(config.collections).toHaveLength(1);
    expect(config.collections[0]?.name).toBe("post");
  });

  it("should set folder to entities/{entityType}", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
    });

    expect(config.collections[0]?.folder).toBe("entities/post");
  });

  it("should set extension and format", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
    });

    expect(config.collections[0]?.extension).toBe("md");
    expect(config.collections[0]?.format).toBe("frontmatter");
  });

  it("should add body field as markdown widget at end", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
    });

    const fields = config.collections[0]?.fields ?? [];
    const lastField = fields[fields.length - 1];
    expect(lastField?.name).toBe("body");
    expect(lastField?.widget).toBe("markdown");
  });

  it("should use entityRouteConfig labels when available", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
      entityRouteConfig: {
        post: { label: "Essay" },
      },
    });

    expect(config.collections[0]?.label).toBe("Essays");
  });

  it("should fall back to entity type name for labels", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
    });

    expect(config.collections[0]?.label).toBe("Posts");
  });

  it("should map frontmatter fields to CMS widgets", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
    });

    const fields = config.collections[0]?.fields ?? [];
    // title, status, publishedAt, + body
    expect(fields).toHaveLength(4);
    expect(fields[0]?.name).toBe("title");
    expect(fields[0]?.widget).toBe("string");
    expect(fields[1]?.name).toBe("status");
    expect(fields[1]?.widget).toBe("select");
    expect(fields[2]?.name).toBe("publishedAt");
    expect(fields[2]?.widget).toBe("datetime");
  });

  it("should set create: true on collections", () => {
    const adapter = createMockAdapter("post", postFrontmatterSchema);
    const config = generateCmsConfig({
      repo: "owner/repo",
      branch: "main",
      entityTypes: ["post"],
      getAdapter: () => adapter,
    });

    expect(config.collections[0]?.create).toBe(true);
  });
});
