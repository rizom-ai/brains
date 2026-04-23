import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
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
      schema: testEntitySchema,
      frontmatterSchema: testFrontmatterSchema,
    });
  }

  public toMarkdown(entity: TestEntity): string {
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
  EntityRegistry.resetInstance();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("test", testEntitySchema, new TestAdapter());
  return new EntitySerializer(registry, logger);
}

describe("EntitySerializer.reconstructEntity", () => {
  it("prefers DB metadata over parsed-markdown metadata", () => {
    const serializer = createSerializer();
    const entity = serializer.reconstructEntity<TestEntity>({
      id: "t1",
      entityType: "test",
      // Stale frontmatter says discovered; DB metadata says approved.
      content: `---\nstatus: discovered\n---\n\nsome body\n`,
      contentHash: "h",
      created: 0,
      updated: 0,
      metadata: { status: "approved" },
    });

    expect(entity.metadata.status).toBe("approved");
  });

  it("uses DB metadata on every shared field when the two disagree", () => {
    const serializer = createSerializer();
    const entity = serializer.reconstructEntity<TestEntity>({
      id: "t1",
      entityType: "test",
      content: `---\nstatus: discovered\ntitle: Old Title\n---\n\nbody\n`,
      contentHash: "h",
      created: 0,
      updated: 0,
      metadata: { status: "approved", title: "New Title" },
    });

    expect(entity.metadata).toEqual({
      status: "approved",
      title: "New Title",
    });
  });

  it("preserves body-parsed top-level fields that DB metadata does not carry", () => {
    const serializer = createSerializer();
    const entity = serializer.reconstructEntity<TestEntity>({
      id: "t1",
      entityType: "test",
      content: `---\nstatus: approved\n---\n\nAbout text here.\n`,
      contentHash: "h",
      created: 0,
      updated: 0,
      metadata: { status: "approved" },
    });

    expect(entity.about).toBe("About text here.");
    expect(entity.metadata.status).toBe("approved");
  });
});
