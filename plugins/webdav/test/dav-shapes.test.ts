import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import { introspectSchema, vaultShapes } from "../src/dav-shapes";

describe("introspectSchema", () => {
  it("should extract required string fields", () => {
    const schema = z.object({
      title: z.string(),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([{ name: "title", type: "string", required: true }]);
  });

  it("should extract optional fields", () => {
    const schema = z.object({
      slug: z.string().optional(),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([{ name: "slug", type: "string", required: false }]);
  });

  it("should extract fields with defaults", () => {
    const schema = z.object({
      embeddable: z.boolean().default(true),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      {
        name: "embeddable",
        type: "boolean",
        required: false,
        defaultValue: true,
      },
    ]);
  });

  it("should extract enum fields with values", () => {
    const schema = z.object({
      status: z.enum(["draft", "queued", "published"]),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      {
        name: "status",
        type: "enum",
        required: true,
        enumValues: ["draft", "queued", "published"],
      },
    ]);
  });

  it("should extract optional enum fields", () => {
    const schema = z.object({
      status: z.enum(["draft", "published"]).optional(),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      {
        name: "status",
        type: "enum",
        required: false,
        enumValues: ["draft", "published"],
      },
    ]);
  });

  it("should extract array fields", () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([{ name: "tags", type: "array", required: true }]);
  });

  it("should extract number fields", () => {
    const schema = z.object({
      seriesOrder: z.number().optional(),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      { name: "seriesOrder", type: "number", required: false },
    ]);
  });

  it("should extract date fields", () => {
    const schema = z.object({
      created: z.coerce.date().optional(),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      { name: "created", type: "date", required: false },
    ]);
  });

  it("should handle nullable fields", () => {
    const schema = z.object({
      coverImage: z.string().nullable().optional(),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      { name: "coverImage", type: "string", required: false },
    ]);
  });

  it("should handle literal fields as string type", () => {
    const schema = z.object({
      entityType: z.literal("post"),
    });
    const fields = introspectSchema(schema);
    expect(fields).toEqual([
      {
        name: "entityType",
        type: "string",
        required: true,
        defaultValue: "post",
      },
    ]);
  });

  it("should handle a complex schema with mixed field types", () => {
    const schema = z.object({
      title: z.string(),
      slug: z.string().optional(),
      status: z.enum(["draft", "queued", "published"]),
      tags: z.array(z.string()).default([]),
      entityType: z.literal("post"),
      seriesOrder: z.number().optional(),
      embeddable: z.boolean().default(true),
    });

    const fields = introspectSchema(schema);
    expect(fields).toHaveLength(7);

    const title = fields.find((f) => f.name === "title");
    expect(title).toEqual({ name: "title", type: "string", required: true });

    const slug = fields.find((f) => f.name === "slug");
    expect(slug).toEqual({ name: "slug", type: "string", required: false });

    const status = fields.find((f) => f.name === "status");
    expect(status).toEqual({
      name: "status",
      type: "enum",
      required: true,
      enumValues: ["draft", "queued", "published"],
    });

    const tags = fields.find((f) => f.name === "tags");
    expect(tags).toEqual({
      name: "tags",
      type: "array",
      required: false,
      defaultValue: [],
    });

    const entityType = fields.find((f) => f.name === "entityType");
    expect(entityType).toEqual({
      name: "entityType",
      type: "string",
      required: true,
      defaultValue: "post",
    });
  });

  it("should return empty array for empty schema", () => {
    const schema = z.object({});
    const fields = introspectSchema(schema);
    expect(fields).toEqual([]);
  });

  // Bookkeeping a type keeps beside its fields, such as whether the file
  // states its slug, is internal, not authored: it is left off Studio's
  // form and out of the vault alike.
  it("leaves out a field the type hides as bookkeeping", () => {
    const fields = introspectSchema(
      z.object({
        title: z.string(),
        authoredSlug: z.boolean().optional().meta({ studioWidget: "hidden" }),
        source: z.string().optional().meta({ studioWidget: "provenance" }),
      }),
    );
    expect(fields.map(({ name }) => name)).toEqual(["title", "source"]);
  });
});

describe("the vault shapes a sync client reads", () => {
  const shapes = {
    types: (): string[] => [
      "note",
      "post",
      "anchor-profile",
      "contact",
      "conflict",
    ],
    frontmatterSchema: (
      type: string,
    ): z.ZodObject<z.ZodRawShape> | undefined =>
      type === "conflict"
        ? undefined
        : z.object({
            title: z.string(),
            ...(type === "post" && {
              status: z.enum(["draft", "published"]).default("draft"),
            }),
          }),
    isSingleton: (type: string): boolean => type === "anchor-profile",
    bodyTemplate: (type: string): string =>
      type === "post" ? "## Intro\n" : "",
    fileExtension: (type: string): ".md" | ".yaml" =>
      type === "contact" ? ".yaml" : ".md",
  };

  it("describes each markdown type with a frontmatter schema", () => {
    expect(vaultShapes(shapes)).toEqual([
      {
        entityType: "note",
        singleton: false,
        bodyTemplate: "",
        fields: [{ name: "title", type: "string", required: true }],
      },
      {
        entityType: "post",
        singleton: false,
        bodyTemplate: "## Intro\n",
        fields: [
          { name: "title", type: "string", required: true },
          {
            name: "status",
            type: "enum",
            required: false,
            defaultValue: "draft",
            enumValues: ["draft", "published"],
          },
        ],
      },
      {
        entityType: "anchor-profile",
        singleton: true,
        bodyTemplate: "",
        fields: [{ name: "title", type: "string", required: true }],
      },
    ]);
  });
});
