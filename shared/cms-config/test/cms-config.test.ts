import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import {
  zodFieldToCmsWidget,
  generateCmsConfig,
  type CmsConfigOptions,
} from "../src/index";

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

  it("should unwrap .optional() and set required: false", () => {
    const result = zodFieldToCmsWidget("slug", z.string().optional());
    expect(result.widget).toBe("string");
    expect(result.required).toBe(false);
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

  interface SchemaMap {
    [key: string]: z.ZodObject<z.ZodRawShape>;
  }

  interface AdapterFlags {
    isSingleton?: boolean;
    hasBody?: boolean;
  }

  interface AdapterMap {
    [key: string]: AdapterFlags;
  }

  function cmsOpts(
    schemas: SchemaMap,
    adapters: AdapterMap = {},
  ): CmsConfigOptions {
    return {
      repo: "owner/repo",
      branch: "main",
      entityTypes: Object.keys(schemas),
      getFrontmatterSchema: (
        type: string,
      ): z.ZodObject<z.ZodRawShape> | undefined => schemas[type],
      getAdapter: (type: string): AdapterFlags | undefined => adapters[type],
    };
  }

  it("should generate correct backend config", () => {
    const config = generateCmsConfig(cmsOpts({}));

    expect(config.backend.name).toBe("github");
    expect(config.backend.repo).toBe("owner/repo");
    expect(config.backend.branch).toBe("main");
  });

  it("should set folder to '.' for base entity type", () => {
    const config = generateCmsConfig(cmsOpts({ base: noteFrontmatterSchema }));

    expect(config.collections[0]?.folder).toBe(".");
  });

  it("should add body field as markdown widget at end", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

    const fields = config.collections[0]?.fields ?? [];
    const lastField = fields[fields.length - 1];
    expect(lastField?.name).toBe("body");
    expect(lastField?.widget).toBe("markdown");
  });

  it("should group singletons into a Settings files collection", () => {
    const characterSchema = z.object({
      name: z.string(),
      role: z.string(),
    });

    const config = generateCmsConfig(
      cmsOpts(
        { post: postFrontmatterSchema, "brain-character": characterSchema },
        { "brain-character": { isSingleton: true, hasBody: false } },
      ),
    );

    expect(config.collections).toHaveLength(2);
    expect(config.collections[1]?.name).toBe("settings");
    expect(config.collections[1]?.files?.[0]?.name).toBe("brain-character");
  });
});
