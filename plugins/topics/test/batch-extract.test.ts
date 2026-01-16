import { describe, it, expect, beforeEach } from "bun:test";
import { topicSourceSchema, type TopicSource } from "../src/schemas/topic";
import TopicsPlugin from "../src/index";
import { createServicePluginHarness } from "@brains/plugins/test";
import { createTestEntity } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";

function createMockEntity(
  id: string,
  type: string,
  status: string = "published",
  contentHash?: string,
): BaseEntity {
  return createTestEntity(type, {
    id,
    content: `Content for ${id}`,
    contentHash: contentHash ?? `hash-${id}`,
    metadata: { status },
  });
}

function createMockTopic(id: string, sources: TopicSource[] = []): BaseEntity {
  return createTestEntity("topic", {
    id,
    content: `# ${id}\n\nTopic content`,
    contentHash: `hash-${id}`,
    metadata: { sources },
  });
}

describe("TopicSource schema", () => {
  it("should require entityId field", () => {
    const sourceWithoutEntityId = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      contentHash: "abc123",
    };

    const result = topicSourceSchema.safeParse(sourceWithoutEntityId);
    expect(result.success).toBe(false);
  });

  it("should require contentHash field", () => {
    const sourceWithoutHash = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      entityId: "post-123",
    };

    const result = topicSourceSchema.safeParse(sourceWithoutHash);
    expect(result.success).toBe(false);
  });

  it("should validate complete source with all fields", () => {
    const completeSource = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      entityId: "post-123",
      contentHash: "abc123def456",
    };

    const result = topicSourceSchema.safeParse(completeSource);
    expect(result.success).toBe(true);
  });
});

describe("TopicsPlugin.getEntitiesToExtract", () => {
  let harness: ReturnType<typeof createServicePluginHarness<TopicsPlugin>>;
  let plugin: TopicsPlugin;

  beforeEach(async () => {
    harness = createServicePluginHarness<TopicsPlugin>();
    plugin = new TopicsPlugin();
    await harness.installPlugin(plugin);
  });

  it("should return entities from extractable types", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post"),
      createMockEntity("link-1", "link"),
    ]);

    const result = await plugin.getEntitiesToExtract();

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toContain("post-1");
    expect(result.map((e) => e.id)).toContain("link-1");
  });

  it("should exclude image entity type", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post"),
      createMockEntity("image-1", "image"),
    ]);

    const result = await plugin.getEntitiesToExtract();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("post-1");
  });

  it("should skip draft entities", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post", "published"),
      createMockEntity("post-2", "post", "draft"),
    ]);

    const result = await plugin.getEntitiesToExtract();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("post-1");
  });

  it("should skip already processed entities by contentHash", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post", "published", "hash-already-processed"),
      createMockEntity("post-2", "post", "published", "hash-new"),
      createMockTopic("topic-1", [
        {
          slug: "post-1",
          title: "Post 1",
          type: "post",
          entityId: "post-1",
          contentHash: "hash-already-processed",
        },
      ]),
    ]);

    const result = await plugin.getEntitiesToExtract();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("post-2");
  });

  it("should include already processed entities when force is true", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post", "published", "hash-already-processed"),
      createMockEntity("post-2", "post", "published", "hash-new"),
      createMockTopic("topic-1", [
        {
          slug: "post-1",
          title: "Post 1",
          type: "post",
          entityId: "post-1",
          contentHash: "hash-already-processed",
        },
      ]),
    ]);

    const result = await plugin.getEntitiesToExtract({ force: true });

    expect(result).toHaveLength(2);
  });

  it("should filter to specific entity types when provided", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post"),
      createMockEntity("link-1", "link"),
      createMockEntity("deck-1", "deck"),
    ]);

    const result = await plugin.getEntitiesToExtract({
      entityTypes: ["post", "deck"],
    });

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toContain("post-1");
    expect(result.map((e) => e.id)).toContain("deck-1");
    expect(result.map((e) => e.id)).not.toContain("link-1");
  });

  it("should apply limit when specified", async () => {
    const shell = harness.getShell();
    shell.addEntities([
      createMockEntity("post-1", "post"),
      createMockEntity("post-2", "post"),
      createMockEntity("post-3", "post"),
    ]);

    const result = await plugin.getEntitiesToExtract({ limit: 2 });

    expect(result).toHaveLength(2);
  });
});
