import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema, BaseEntityAdapter } from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins/test";
import { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";

class TestAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "note",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown, entityType: "note", metadata: {} };
  }

  public toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }
}

/**
 * When autoSync is disabled, entities created via tools (e.g. system_create)
 * must still be exported to disk. Otherwise:
 * - Auto-commit has nothing new to commit
 * - The entity exists in DB but not on disk
 * - Orphan cleanup would delete it on next sync
 */
describe("auto-export without autoSync", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let syncPath: string;

  beforeEach(async () => {
    syncPath = join(tmpdir(), `test-auto-export-${Date.now()}`);
    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });

    const entityRegistry = harness.getEntityRegistry();
    entityRegistry.registerEntityType(
      "note",
      baseEntitySchema,
      new TestAdapter(),
    );

    const plugin = new DirectorySyncPlugin({
      syncPath,
      autoSync: false,
      initialSync: false,
    });

    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });

  it("should export entity to disk when entity:created fires", async () => {
    const entity = createTestEntity("note", {
      id: "test-note",
      content: "---\n---\nHello world",
    });

    await harness.sendMessage(
      "entity:created",
      { entity, entityType: "note", entityId: "test-note" },
      "test",
    );

    const filePath = join(syncPath, "note", "test-note.md");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should export entity to disk when entity:updated fires", async () => {
    const entity = createTestEntity("note", {
      id: "updated-note",
      content: "---\n---\nUpdated content",
    });

    // For entity:updated, the subscriber fetches from DB
    const entityService = harness.getEntityService();
    const origGetEntity = entityService.getEntity.bind(entityService);
    entityService.getEntity = async <T extends BaseEntity>(
      type: string,
      id: string,
    ): Promise<T | null> => {
      if (type === "note" && id === "updated-note") return entity as T;
      return origGetEntity(type, id);
    };

    await harness.sendMessage(
      "entity:updated",
      { entity, entityType: "note", entityId: "updated-note" },
      "test",
    );

    const filePath = join(syncPath, "note", "updated-note.md");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should delete entity file when entity:deleted fires", async () => {
    // Create the file first
    const noteDir = join(syncPath, "note");
    mkdirSync(noteDir, { recursive: true });
    const filePath = join(noteDir, "doomed-note.md");
    writeFileSync(filePath, "---\n---\nAbout to be deleted");
    expect(existsSync(filePath)).toBe(true);

    await harness.sendMessage(
      "entity:deleted",
      { entityType: "note", entityId: "doomed-note" },
      "test",
    );

    expect(existsSync(filePath)).toBe(false);
  });
});
