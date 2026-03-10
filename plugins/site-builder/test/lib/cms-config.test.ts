import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import {
  zodFieldToCmsWidget,
  generateCmsConfig,
  type CmsConfigOptions,
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

  /** Schema registry for tests — maps entity type to its frontmatter schema */
  interface SchemaMap {
    [key: string]: z.ZodObject<z.ZodRawShape>;
  }

  /** Adapter flags for tests */
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

  it("should include baseUrl when provided", () => {
    const config = generateCmsConfig({
      ...cmsOpts({}),
      baseUrl: "https://auth.example.com",
    });

    expect(config.backend.base_url).toBe("https://auth.example.com");
  });

  it("should generate one collection per entity type with schema", () => {
    const config = generateCmsConfig(
      cmsOpts({
        post: postFrontmatterSchema,
        note: noteFrontmatterSchema,
      }),
    );

    expect(config.collections).toHaveLength(2);
    expect(config.collections[0]?.name).toBe("post");
    expect(config.collections[1]?.name).toBe("note");
  });

  it("should skip entity types without schema", () => {
    const schemas: SchemaMap = { post: postFrontmatterSchema };
    const config = generateCmsConfig({
      ...cmsOpts(schemas),
      entityTypes: ["post", "image"],
    });

    expect(config.collections).toHaveLength(1);
    expect(config.collections[0]?.name).toBe("post");
  });

  it("should set folder to entity type name", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

    expect(config.collections[0]?.folder).toBe("post");
  });

  it("should set folder to '.' for base entity type", () => {
    const config = generateCmsConfig(cmsOpts({ base: noteFrontmatterSchema }));

    expect(config.collections[0]?.folder).toBe(".");
  });

  it("should set extension and format", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

    expect(config.collections[0]?.extension).toBe("md");
    expect(config.collections[0]?.format).toBe("frontmatter");
  });

  it("should add body field as markdown widget at end", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

    const fields = config.collections[0]?.fields ?? [];
    const lastField = fields[fields.length - 1];
    expect(lastField?.name).toBe("body");
    expect(lastField?.widget).toBe("markdown");
  });

  it("should use entityRouteConfig labels when available", () => {
    const config = generateCmsConfig({
      ...cmsOpts({ post: postFrontmatterSchema }),
      entityRouteConfig: { post: { label: "Essay" } },
    });

    expect(config.collections[0]?.label).toBe("Essays");
  });

  it("should fall back to entity type name for labels", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

    expect(config.collections[0]?.label).toBe("Posts");
  });

  it("should map frontmatter fields to CMS widgets", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

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

  it("should set create: true on folder collections", () => {
    const config = generateCmsConfig(cmsOpts({ post: postFrontmatterSchema }));

    expect(config.collections[0]?.create).toBe(true);
  });

  describe("singleton entities", () => {
    const characterSchema = z.object({
      name: z.string(),
      role: z.string(),
      purpose: z.string(),
      values: z.array(z.string()),
    });

    const anchorSchema = z.object({
      name: z.string(),
      description: z.string().optional(),
    });

    it("should group singletons into a Settings files collection", () => {
      const config = generateCmsConfig(
        cmsOpts(
          {
            "brain-character": characterSchema,
            "anchor-profile": anchorSchema,
          },
          {
            "brain-character": { isSingleton: true, hasBody: false },
            "anchor-profile": { isSingleton: true, hasBody: false },
          },
        ),
      );

      expect(config.collections).toHaveLength(1);
      expect(config.collections[0]?.name).toBe("settings");
      expect(config.collections[0]?.label).toBe("Settings");
      expect(config.collections[0]?.files).toHaveLength(2);
    });

    it("should set file path to {entityType}/{entityType}.md", () => {
      const config = generateCmsConfig(
        cmsOpts(
          { "brain-character": characterSchema },
          { "brain-character": { isSingleton: true, hasBody: false } },
        ),
      );

      const file = config.collections[0]?.files?.[0];
      expect(file?.file).toBe("brain-character/brain-character.md");
    });

    it("should use singular label for singleton file entries", () => {
      const config = generateCmsConfig(
        cmsOpts(
          { "brain-character": characterSchema },
          { "brain-character": { isSingleton: true, hasBody: false } },
        ),
      );

      const file = config.collections[0]?.files?.[0];
      expect(file?.label).toBe("Brain Character");
    });

    it("should include fields from schema on singleton file entries", () => {
      const config = generateCmsConfig(
        cmsOpts(
          { "brain-character": characterSchema },
          { "brain-character": { isSingleton: true, hasBody: false } },
        ),
      );

      const fields = config.collections[0]?.files?.[0]?.fields ?? [];
      expect(fields.map((f) => f.name)).toEqual([
        "name",
        "role",
        "purpose",
        "values",
      ]);
    });

    it("should not have folder or create on the Settings collection", () => {
      const config = generateCmsConfig(
        cmsOpts(
          { "brain-character": characterSchema },
          { "brain-character": { isSingleton: true, hasBody: false } },
        ),
      );

      expect(config.collections[0]?.folder).toBeUndefined();
      expect(config.collections[0]?.create).toBeUndefined();
    });
  });

  describe("hasBody", () => {
    it("should skip body widget when hasBody is false", () => {
      const schema = z.object({ name: z.string() });
      const config = generateCmsConfig(
        cmsOpts(
          { "brain-character": schema },
          { "brain-character": { isSingleton: true, hasBody: false } },
        ),
      );

      const fields = config.collections[0]?.files?.[0]?.fields ?? [];
      expect(fields.map((f) => f.name)).toEqual(["name"]);
      expect(fields.find((f) => f.name === "body")).toBeUndefined();
    });

    it("should include body widget when hasBody is not set (defaults to true)", () => {
      const config = generateCmsConfig(
        cmsOpts({ post: postFrontmatterSchema }),
      );

      const fields = config.collections[0]?.fields ?? [];
      expect(fields[fields.length - 1]?.name).toBe("body");
    });

    it("should include body widget on non-singleton with hasBody true", () => {
      const topicSchema = z.object({
        title: z.string(),
        keywords: z.array(z.string()).optional(),
      });
      const config = generateCmsConfig(cmsOpts({ topic: topicSchema }));

      const fields = config.collections[0]?.fields ?? [];
      expect(fields[fields.length - 1]?.name).toBe("body");
    });
  });

  describe("mixed collections", () => {
    it("should handle both singletons and multi-file entities", () => {
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

      // post as folder collection + settings as files collection
      expect(config.collections).toHaveLength(2);

      const postCollection = config.collections[0];
      expect(postCollection?.name).toBe("post");
      expect(postCollection?.folder).toBe("post");

      const settingsCollection = config.collections[1];
      expect(settingsCollection?.name).toBe("settings");
      expect(settingsCollection?.files).toHaveLength(1);
      expect(settingsCollection?.files?.[0]?.name).toBe("brain-character");
    });
  });
});
