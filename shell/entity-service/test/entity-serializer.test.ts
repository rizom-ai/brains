import { describe, it, expect, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger, createMockLogger } from "@brains/test-utils";
import type { EntityData } from "../src/entity-data";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { baseEntitySchema } from "../src/types";

const testFrontmatterSchema = z.object({
  status: z.enum(["discovered", "approved"]),
  title: z.string().optional(),
});

const testEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
  metadata: testFrontmatterSchema,
  about: z.string().optional(),
});

type TestEntity = z.infer<typeof testEntitySchema>;
type TestMetadata = TestEntity["metadata"];

class TestAdapter extends BaseEntityAdapter<TestEntity, TestMetadata> {
  constructor() {
    super({
      entityType: "test",
      purpose: "Test entity for unit tests.",
      schema: testEntitySchema,
      frontmatterSchema: testFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: TestEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<TestEntity> {
    const frontmatter = this.parseFrontMatter(markdown, testFrontmatterSchema);
    const body = this.extractBody(markdown).trim();
    return {
      content: markdown,
      entityType: "test",
      metadata: frontmatter,
      // Body-parsed top-level field. DB metadata doesn't carry it —
      // reconstruction should still surface it.
      ...(body && { about: body }),
    };
  }
}

function createSerializer(): EntitySerializer {
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("test", testEntitySchema, new TestAdapter());
  return new EntitySerializer(registry, logger);
}

describe("EntitySerializer.reconstructEntity", () => {
  it("logs an entity that fails to parse and leaves it out", async () => {
    const logger = createMockLogger();
    const registry = EntityRegistry.createFresh(logger);
    const adapter = new TestAdapter();
    registry.registerEntityType("test", testEntitySchema, adapter);
    const serializer = new EntitySerializer(registry, logger);
    const row: EntityData = {
      id: "private-query-identifier",
      entityType: "test",
      content: "body",
      contentHash: "h",
      visibility: "public",
      created: 0,
      updated: 0,
      metadata: {},
    };
    const parser = spyOn(adapter, "fromMarkdown").mockImplementation(() => {
      throw new Error("private parser payload");
    });
    try {
      expect(await serializer.convertToEntity(row)).toBeNull();
      expect(await serializer.convertToEntities([row], "test")).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(2);
    } finally {
      parser.mockRestore();
    }
  });

  it("prefers DB metadata over parsed-markdown metadata", () => {
    const serializer = createSerializer();
    const entity = testEntitySchema.parse(
      serializer.reconstructEntity({
        id: "t1",
        entityType: "test",
        // Stale frontmatter says discovered; DB metadata says approved.
        content: `---\nstatus: discovered\n---\n\nsome body\n`,
        contentHash: "h",
        visibility: "public",
        created: 0,
        updated: 0,
        metadata: { status: "approved" },
      }),
    );

    expect(entity.metadata.status).toBe("approved");
  });

  it("uses DB metadata on every shared field when the two disagree", () => {
    const serializer = createSerializer();
    const entity = testEntitySchema.parse(
      serializer.reconstructEntity({
        id: "t1",
        entityType: "test",
        content: `---\nstatus: discovered\ntitle: Old Title\n---\n\nbody\n`,
        contentHash: "h",
        visibility: "public",
        created: 0,
        updated: 0,
        metadata: { status: "approved", title: "New Title" },
      }),
    );

    expect(entity.metadata).toEqual({
      status: "approved",
      title: "New Title",
    });
  });

  it("preserves body-parsed top-level fields that DB metadata does not carry", () => {
    const serializer = createSerializer();
    const entity = testEntitySchema.parse(
      serializer.reconstructEntity({
        id: "t1",
        entityType: "test",
        content: `---\nstatus: approved\n---\n\nAbout text here.\n`,
        contentHash: "h",
        visibility: "public",
        created: 0,
        updated: 0,
        metadata: { status: "approved" },
      }),
    );

    expect(entity.about).toBe("About text here.");
    expect(entity.metadata.status).toBe("approved");
  });
});

describe("EntitySerializer.serializeEntity, a type that writes more than it presents", () => {
  /** Presents status and title; writes a generation error too. */
  class WritingAdapter extends TestAdapter {
    readonly writtenFrontmatterSchema = testFrontmatterSchema.extend({
      error: z.string().optional(),
    });

    public override toMarkdown(entity: TestEntity): string {
      return `---\nstatus: ${entity.metadata.status}\n---\n${this.extractBody(entity.content)}`;
    }
  }

  it("never keeps a field it writes from the source, though it does not present it", () => {
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType("test", testEntitySchema, new WritingAdapter());
    const serializer = new EntitySerializer(registry, logger);
    const entity: TestEntity = {
      id: "t1",
      entityType: "test",
      // The source still says the generation failed; the type wrote it out.
      content:
        "---\nstatus: approved\nerror: the model timed out\nauthor: Ada\n---\nBody\n",
      contentHash: "",
      visibility: "public",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      metadata: { status: "approved" },
    };
    // The error it writes is its own to drop; the author it neither writes
    // nor presents is the file's own, kept.
    expect(serializer.serializeEntity(entity)).toBe(
      "---\nstatus: approved\nauthor: Ada\n---\nBody\n",
    );
  });
});
