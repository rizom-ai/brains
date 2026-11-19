import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import conflictPackage from "@brains/conflict";
import {
  createDirectorySyncPackage,
  type DirectorySyncState,
} from "@brains/directory-sync";
import notePackage from "@brains/note";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { computeContentHash } from "@brains/utils/hash";

/**
 * The seam the two packages' own tests fake: directory-sync asks over the
 * bus for a losing file edit to be kept, and the conflict service keeps it.
 */
describe("a file edit that loses, in a brain with both packages", () => {
  let harness: ReturnType<typeof createPluginHarness<Plugin>>;
  let syncPath: string;
  const held: { state?: DirectorySyncState } = {};

  beforeEach(async () => {
    syncPath = mkdtempSync(join(tmpdir(), "test-sync-conflicts-brain-"));
    harness = createPluginHarness<Plugin>({ dataDir: syncPath });
    const metadata = { name: "@rizom/brain", version: "0.0.0" };
    const plugins = [
      ...instantiatePluginPackageDefinition(notePackage, {}, metadata, {
        pluginId: "note",
      }),
      ...instantiatePluginPackageDefinition(conflictPackage, {}, metadata, {
        pluginId: "conflicts",
      }),
      ...instantiatePluginPackageDefinition(
        createDirectorySyncPackage({
          onSetup: (state): void => {
            held.state = state;
          },
        }),
        { syncPath, autoSync: false, initialSync: false },
        metadata,
        { pluginId: "directory-sync" },
      ),
    ];
    for (const plugin of plugins) await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
  });

  afterEach(async () => {
    await harness.reset();
    rmSync(syncPath, { recursive: true, force: true });
  });

  it("keeps the entity, records the file's text as a conflict and rewrites the file", async () => {
    const sync = held.state?.sync.getDirectorySync();
    if (!sync) throw new Error("Directory sync is not running");
    const service = harness.getEntityService();
    const file = join(syncPath, "hello.md");

    writeFileSync(file, "First version\n");
    await sync.importEntities(["hello.md"]);
    const first = await service.getEntity({ entityType: "note", id: "hello" });
    if (!first) throw new Error("The note was not imported");

    // An edit in the brain, then one in the file before export ran.
    const edited = { ...first, content: "Edited in Studio\n" };
    await service.upsertEntity({
      entity: {
        ...edited,
        contentHash: computeContentHash(service.serializeEntity(edited)),
      },
    });
    writeFileSync(file, "Edited in a file\n");
    await sync.importEntities(["hello.md"]);

    const conflicts = await service.listEntities({
      entityType: "conflict",
      // A conflict is never public.
      options: { filter: { visibilityScope: "restricted" } },
    });
    expect(await service.listEntities({ entityType: "conflict" })).toEqual([]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.metadata).toMatchObject({
      targetType: "note",
      targetId: "hello",
      origin: "file",
    });
    expect(conflicts[0]?.content).toContain("Edited in a file");
    expect(conflicts[0]?.visibility).not.toBe("public");
    expect(
      (await service.getEntity({ entityType: "note", id: "hello" }))?.content,
    ).toContain("Edited in Studio");
    expect(readFileSync(file, "utf8")).toContain("Edited in Studio");
  });
});
