import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import {
  baseEntitySchema,
  BaseEntityAdapter,
  emptyFrontmatterSchema,
} from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins/test";
import { createTestEntity, waitUntil } from "@brains/test-utils";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, writeFileSync, mkdtempSync } from "fs";

class TestAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "note",
      purpose: "Test entity for unit tests.",
      schema: baseEntitySchema,
      frontmatterSchema: emptyFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown, entityType: "note", metadata: {} };
  }

  public override toMarkdown(entity: BaseEntity): string {
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
  let plugin: DirectorySyncPlugin;
  let syncPath: string;
  let replacementPath: string | undefined;

  beforeEach(async () => {
    replacementPath = undefined;
    syncPath = mkdtempSync(join(tmpdir(), "test-auto-export-"));
    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });

    const entityRegistry = harness.getEntityRegistry();
    entityRegistry.registerEntityType(
      "note",
      baseEntitySchema,
      new TestAdapter(),
    );

    plugin = new DirectorySyncPlugin({
      syncPath,
      autoSync: false,
      initialSync: false,
      commitDebounce: 100,
    });

    await harness.installPlugin(plugin);
  });

  afterEach(async () => {
    await harness.reset();
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
    if (replacementPath && existsSync(replacementPath)) {
      rmSync(replacementPath, { recursive: true, force: true });
    }
  });

  it("should export entity to disk when entity:created fires", async () => {
    const entity = createTestEntity("note", {
      id: "test-note",
      content: "---\n---\nHello world",
    });
    await harness.getEntityService().upsertEntity({ entity });

    await harness.sendMessage(
      "entity:created",
      { entity, entityType: "note", entityId: "test-note" },
      "test",
    );

    const filePath = join(syncPath, "test-note.md");
    await waitUntil(() => existsSync(filePath), "the durable create export");
  });

  it("should export entity to disk when entity:updated fires", async () => {
    const entity = createTestEntity("note", {
      id: "updated-note",
      content: "---\n---\nUpdated content",
    });
    await harness.getEntityService().upsertEntity({ entity });

    await harness.sendMessage(
      "entity:updated",
      { entity, entityType: "note", entityId: "updated-note" },
      "test",
    );

    const filePath = join(syncPath, "updated-note.md");
    await waitUntil(() => existsSync(filePath), "the durable update export");
  });

  it("resolves the replacement path after reconfiguration", async () => {
    replacementPath = mkdtempSync(
      join(tmpdir(), "test-auto-export-replacement-"),
    );
    await plugin.configure({ syncPath: replacementPath });
    const entity = createTestEntity("note", {
      id: "replacement-note",
      content: "---\n---\nReplacement content",
    });
    await harness.getEntityService().upsertEntity({ entity });

    await harness.sendMessage(
      "entity:created",
      { entity, entityType: "note", entityId: "replacement-note" },
      "test",
    );

    await waitUntil(
      () => existsSync(join(replacementPath ?? "", "replacement-note.md")),
      "the replacement-path durable export",
    );
    expect(existsSync(join(syncPath, "replacement-note.md"))).toBe(false);
  });

  it("should delete entity file when entity:deleted fires", async () => {
    const filePath = join(syncPath, "doomed-note.md");
    writeFileSync(filePath, "---\n---\nAbout to be deleted");
    expect(existsSync(filePath)).toBe(true);
    const entity = createTestEntity("note", {
      id: "doomed-note",
      content: "---\n---\nAbout to be deleted",
    });
    await harness.getEntityService().upsertEntity({ entity });
    await harness.getEntityService().deleteEntity({
      entityType: "note",
      id: entity.id,
    });

    await harness.sendMessage(
      "entity:deleted",
      { entityType: "note", entityId: "doomed-note" },
      "test",
    );

    await waitUntil(() => !existsSync(filePath), "the durable delete export");
  });
});
