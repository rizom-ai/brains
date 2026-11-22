import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RecordConflictRequest } from "@brains/contracts";
import {
  EntityRegistry,
  EntityService,
  assetRefSchema,
  baseEntitySchema,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";
import { BaseEntityAdapter, type BaseEntity } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { DirectorySync } from "../src/lib/directory-sync";
import { memorySyncBase, type SyncBaseStore } from "../src/lib/sync-base";
import type { PullConflict } from "../src/types";
import { TINY_PNG_BYTES } from "./fixtures";

/**
 * A type whose stored form differs from what a person may type: line endings
 * are normalized, as a real type normalizes far more.
 */
class PlainAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Sync conflict test type",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }
  public override toMarkdown(entity: BaseEntity): string {
    return entity.content.replace(/\r\n/g, "\n");
  }
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown.replace(/\r\n/g, "\n") };
  }
}

interface Brain {
  root: string;
  service: EntityService;
  sync: DirectorySync;
  base: SyncBaseStore;
  recorded: RecordConflictRequest[];
  /** Whether the conflict service answers; a brain without it holds nothing. */
  conflictsAvailable: boolean;
}

const hash = (text: string): string => computeContentHash(text);

describe("directory-sync against the version it last synced", () => {
  let brain: Brain;

  beforeEach(async () => {
    const root = mkdtempSync(join(tmpdir(), "test-sync-conflicts-"));
    const logger = createSilentLogger();
    const dbConfig = { url: `file:${root}/entities.db` };
    await migrateEntities(dbConfig, logger);
    const registry = EntityRegistry.createFresh(logger);
    // An image as the brain stores one: nothing but a reference to bytes.
    registry.registerEntityType(
      "image",
      baseEntitySchema,
      new PlainAdapter("image"),
      { binaryStorage: "asset" },
    );
    for (const type of ["post", "conflict"]) {
      registry.registerEntityType(
        type,
        baseEntitySchema,
        new PlainAdapter(type),
      );
    }
    const service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${root}/embeddings.db` },
      entityRegistry: registry,
      logger,
      jobQueueService: createMockShell().getJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: createRefusingEmbeddingService(),
    });
    const base = memorySyncBase();
    const recorded: RecordConflictRequest[] = [];
    const syncPath = join(root, "brain-data");
    mkdirSync(syncPath, { recursive: true });
    brain = {
      root: syncPath,
      service,
      base,
      recorded,
      conflictsAvailable: true,
      sync: new DirectorySync({
        syncPath,
        entityService: service,
        logger,
        deleteOnFileRemoval: true,
        conflicts: {
          base,
          record: async (request): Promise<boolean> => {
            if (!brain.conflictsAvailable) return false;
            recorded.push(request);
            return true;
          },
        },
      }),
    };
  });

  afterEach(() => {
    brain.service.close();
    rmSync(dirname(brain.root), { recursive: true, force: true });
  });

  const file = (path: string): string => join(brain.root, path);
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(file(path)), { recursive: true });
    writeFileSync(file(path), text);
  };
  const read = (path: string): string => readFileSync(file(path), "utf8");
  const stored = async (id = "a"): Promise<BaseEntity | null> =>
    brain.service.getEntity({
      entityType: "post",
      id,
      visibilityScope: "restricted",
      source: true,
    });
  /** A file and an entity that agree, as after any earlier sync. */
  const synced = async (text = "First version\n"): Promise<void> => {
    write("post/a.md", text);
    await brain.sync.importEntities(["post/a.md"]);
  };
  const editInBrain = async (text: string): Promise<void> => {
    const current = await stored();
    if (!current) throw new Error("Nothing to edit");
    await brain.service.updateEntity({ entity: { ...current, content: text } });
  };

  it("records the version a file and its entity last agreed on", async () => {
    await synced();

    expect((await stored())?.content).toBe("First version\n");
    expect(await brain.base.get("post", "a")).toBe(hash("First version\n"));
  });

  it("imports an edited file over an entity that has not changed", async () => {
    await synced();
    write("post/a.md", "Edited in a file\n");

    const result = await brain.sync.importEntities(["post/a.md"]);

    expect(result.imported).toBe(1);
    expect((await stored())?.content).toBe("Edited in a file\n");
    expect(await brain.base.get("post", "a")).toBe(hash("Edited in a file\n"));
    expect(brain.recorded).toEqual([]);
  });

  it("keeps the entity and hands the file's text over as a conflict when both changed", async () => {
    await synced();
    await editInBrain("Edited in Studio\n");
    write("post/a.md", "Edited in a file\n");

    const result = await brain.sync.importEntities(["post/a.md"]);

    expect(result.imported).toBe(0);
    expect((await stored())?.content).toBe("Edited in Studio\n");
    expect(brain.recorded).toEqual([
      {
        entityType: "post",
        entityId: "a",
        origin: "file",
        base: hash("First version\n"),
        current: hash("Edited in Studio\n"),
        text: "Edited in a file\n",
        targetVisibility: "public",
      },
    ]);
    // Export rewrites the file, and the two agree again.
    expect(read("post/a.md")).toBe("Edited in Studio\n");
    expect(await brain.base.get("post", "a")).toBe(hash("Edited in Studio\n"));
    expect((result.issues ?? []).map((issue) => issue.path)).toEqual([
      "post/a.md",
    ]);

    // The next scan finds nothing to do.
    const again = await brain.sync.importEntities(["post/a.md"]);
    expect(again.imported).toBe(0);
    expect(brain.recorded).toHaveLength(1);
  });

  it("does not let a file that was never edited overwrite a newer entity", async () => {
    await synced();
    await editInBrain("Edited in Studio\n");

    // The file still holds the first version, as on a startup scan before export.
    const result = await brain.sync.importEntities(["post/a.md"]);

    expect(result.imported).toBe(0);
    expect((await stored())?.content).toBe("Edited in Studio\n");
    expect(read("post/a.md")).toBe("Edited in Studio\n");
    expect(brain.recorded).toEqual([]);
  });

  it("does not take a file that differs only in bytes for an edit", async () => {
    await synced();
    await editInBrain("Edited in Studio\n");
    // A checkout with CRLF: other bytes, the same text as the base.
    write("post/a.md", "First version\r\n");

    await brain.sync.importEntities(["post/a.md"]);

    expect((await stored())?.content).toBe("Edited in Studio\n");
    expect(brain.recorded).toEqual([]);
  });

  it("imports as before when no version was recorded yet, and records one", async () => {
    await brain.service.createEntity({
      entity: {
        id: "a",
        entityType: "post",
        content: "From an older brain\n",
        metadata: {},
      },
    });
    write("post/a.md", "From the file\n");

    const result = await brain.sync.importEntities(["post/a.md"]);

    expect(result.imported).toBe(1);
    expect((await stored())?.content).toBe("From the file\n");
    expect(await brain.base.get("post", "a")).toBe(hash("From the file\n"));
    expect(brain.recorded).toEqual([]);
  });

  it("records a version for a file that already matches its entity", async () => {
    await brain.service.createEntity({
      entity: { id: "a", entityType: "post", content: "Same\n", metadata: {} },
    });
    write("post/a.md", "Same\n");

    await brain.sync.importEntities(["post/a.md"]);

    expect(await brain.base.get("post", "a")).toBe(hash("Same\n"));
  });

  it("leaves the file alone when nothing can hold the conflict", async () => {
    await synced();
    await editInBrain("Edited in Studio\n");
    write("post/a.md", "Edited in a file\n");
    brain.conflictsAvailable = false;

    const result = await brain.sync.importEntities(["post/a.md"]);

    // The only copy of the edit is the file: it is not overwritten.
    expect(read("post/a.md")).toBe("Edited in a file\n");
    expect((await stored())?.content).toBe("Edited in Studio\n");
    expect(await brain.base.get("post", "a")).toBe(hash("First version\n"));
    expect(
      (result.issues ?? []).map((issue) => issue.message).join(" "),
    ).toContain("could not be kept");

    // Once the conflict service answers, the same file becomes a conflict.
    brain.conflictsAvailable = true;
    await brain.sync.importEntities(["post/a.md"]);
    expect(brain.recorded).toHaveLength(1);
    expect(read("post/a.md")).toBe("Edited in Studio\n");
  });

  it("creates an entity for a new file and records its version", async () => {
    write("post/new.md", "A new post\n");

    const result = await brain.sync.importEntities(["post/new.md"]);

    expect(result.imported).toBe(1);
    expect(await brain.base.get("post", "new")).toBe(hash("A new post\n"));
  });

  it("never imports a conflict file, and puts back one that was edited", async () => {
    await brain.service.createEntity({
      entity: {
        id: "post:a:20261118T102030Z",
        entityType: "conflict",
        content: "The conflict as the brain wrote it\n",
        visibility: "shared",
        metadata: {},
      },
    });
    write("conflict/post/a/20261118T102030Z.md", "Edited by hand\n");
    write("conflict/post/a/stray.md", "No such conflict\n");

    const result = await brain.sync.importEntities([
      "conflict/post/a/20261118T102030Z.md",
      "conflict/post/a/stray.md",
    ]);

    expect(result.imported).toBe(0);
    const restored = read("conflict/post/a/20261118T102030Z.md");
    expect(restored).toContain("The conflict as the brain wrote it\n");
    expect(restored).not.toContain("Edited by hand");
    // A file no conflict stands behind is left for a person to look at.
    expect(existsSync(file("conflict/post/a/stray.md"))).toBe(true);
    expect(
      await brain.service.getEntity({
        entityType: "conflict",
        id: "post:a:stray",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  describe("export", () => {
    const exported = async (): Promise<void> => {
      const current = await stored();
      if (!current) throw new Error("Nothing to export");
      await brain.sync.writeEntityFile(current);
    };

    it("forgets the version of an entity whose file it removes", async () => {
      await synced();
      expect(await brain.base.get("post", "a")).toBeDefined();

      // What the export does for an entity that was deleted or renamed.
      await brain.sync.removeEntityFiles("post", "a");

      expect(existsSync(file("post/a.md"))).toBe(false);
      expect(await brain.base.get("post", "a")).toBeUndefined();
    });

    it("records the version it wrote", async () => {
      await synced();
      await editInBrain("Edited in Studio\n");

      await exported();

      expect(read("post/a.md")).toBe("Edited in Studio\n");
      expect(await brain.base.get("post", "a")).toBe(
        hash("Edited in Studio\n"),
      );
    });

    it("does not overwrite a file that was edited before its import ran", async () => {
      await synced();
      write("post/a.md", "Edited in a file\n");
      await editInBrain("Edited in Studio\n");

      // The export of the Studio edit runs before the file's import does.
      await exported();

      expect(brain.recorded.map((conflict) => conflict.text)).toEqual([
        "Edited in a file\n",
      ]);
      expect(read("post/a.md")).toBe("Edited in Studio\n");
      expect((await stored())?.content).toBe("Edited in Studio\n");
    });

    it("leaves an edited file alone when nothing can hold the conflict", async () => {
      await synced();
      write("post/a.md", "Edited in a file\n");
      await editInBrain("Edited in Studio\n");
      brain.conflictsAvailable = false;

      await exported();

      expect(read("post/a.md")).toBe("Edited in a file\n");
      expect(await brain.base.get("post", "a")).toBe(hash("First version\n"));
    });
  });

  describe("a removed file", () => {
    const remove = (path: string): void => unlinkSync(file(path));

    it("deletes an entity that has not changed since", async () => {
      await synced();
      remove("post/a.md");

      expect(await brain.sync.deleteForRemovedFile("post", "a")).toBe(
        "deleted",
      );
      expect(await stored()).toBeNull();
      expect(await brain.base.get("post", "a")).toBeUndefined();
    });

    it("deletes nothing when the entity changed, and writes its file back", async () => {
      await synced();
      await editInBrain("Edited in Studio\n");
      remove("post/a.md");

      expect(await brain.sync.deleteForRemovedFile("post", "a")).toBe("kept");
      expect((await stored())?.content).toBe("Edited in Studio\n");
      expect(read("post/a.md")).toBe("Edited in Studio\n");
      expect(brain.recorded).toEqual([]);
    });

    it("keeps a changed entity through the orphan cleanup", async () => {
      await synced();
      await editInBrain("Edited in Studio\n");
      remove("post/a.md");

      const result = await brain.sync.removeOrphanedEntities();

      expect(result.deleted).toBe(0);
      expect((await stored())?.content).toBe("Edited in Studio\n");
      expect(read("post/a.md")).toBe("Edited in Studio\n");
    });

    it("still removes an unchanged entity through the orphan cleanup", async () => {
      await synced();
      remove("post/a.md");

      const result = await brain.sync.removeOrphanedEntities();

      expect(result.deleted).toBe(1);
      expect(await stored()).toBeNull();
    });

    it("keeps a changed entity through a batch export", async () => {
      await synced();
      await editInBrain("Edited in Studio\n");
      remove("post/a.md");

      await brain.sync.exportEntities(["post"]);

      expect((await stored())?.content).toBe("Edited in Studio\n");
      expect(read("post/a.md")).toBe("Edited in Studio\n");
    });

    it("never deletes a conflict, and writes its file back", async () => {
      await brain.service.createEntity({
        entity: {
          id: "post:a:20261118T102030Z",
          entityType: "conflict",
          content: "The conflict as the brain wrote it\n",
          visibility: "shared",
          metadata: {},
        },
      });

      expect(
        await brain.sync.deleteForRemovedFile(
          "conflict",
          "post:a:20261118T102030Z",
        ),
      ).toBe("kept");
      await brain.sync.removeOrphanedEntities();
      await brain.sync.exportEntities(["conflict"]);

      expect(read("conflict/post/a/20261118T102030Z.md")).toContain(
        "The conflict as the brain wrote it",
      );
    });
  });

  describe("a remote text a pull did not take", () => {
    const pulled = (text: string, path = "post/a.md"): PullConflict => ({
      id: hash(`${path}\n${text}`),
      path,
      text,
    });

    it("becomes a conflict from git on the entity the brain kept", async () => {
      await synced();
      await editInBrain("Edited in Studio\n");
      const conflict = pulled("Edited remotely\n");

      expect(await brain.sync.recordPullConflicts([conflict])).toEqual([
        conflict.id,
      ]);
      expect(brain.recorded).toEqual([
        {
          entityType: "post",
          entityId: "a",
          origin: "git",
          current: hash("Edited in Studio\n"),
          text: "Edited remotely\n",
          targetVisibility: "public",
        },
      ]);
    });

    it("carries the visibility the remote text declares", async () => {
      await synced();
      const conflict = pulled("---\nvisibility: restricted\n---\nDraft\n");

      await brain.sync.recordPullConflicts([conflict]);

      expect(brain.recorded[0]?.declaredVisibility).toBe("restricted");
    });

    it("stays unacknowledged while nothing can hold the conflict", async () => {
      await synced();
      brain.conflictsAvailable = false;

      expect(
        await brain.sync.recordPullConflicts([pulled("Edited remotely\n")]),
      ).toEqual([]);
    });

    it("is dropped when its file belongs to no entity", async () => {
      const conflict = pulled("Edited remotely\n", "post/gone.md");

      expect(await brain.sync.recordPullConflicts([conflict])).toEqual([
        conflict.id,
      ]);
      expect(brain.recorded).toEqual([]);
    });
  });

  describe("an image file", () => {
    // Bytes after a PNG's end are ignored by a reader, and make another file.
    const png = (mark: string): Buffer =>
      Buffer.concat([TINY_PNG_BYTES, Buffer.from(mark)]);
    const same = (left: Buffer, right: Buffer): boolean =>
      left.toString("base64") === right.toString("base64");
    const writeImage = (bytes: Buffer): void => {
      mkdirSync(file("image"), { recursive: true });
      writeFileSync(file("image/cover.png"), bytes);
    };
    const image = async (): Promise<BaseEntity> => {
      const entity = await brain.service.getEntity({
        entityType: "image",
        id: "cover",
        visibilityScope: "restricted",
        source: true,
      });
      if (!entity) throw new Error("No image");
      return entity;
    };
    const storedImage = async (): Promise<Buffer> =>
      Buffer.from(
        await brain.service.readAsset(
          assetRefSchema.parse((await image()).content),
        ),
      );
    const replaceInBrain = async (bytes: Buffer): Promise<void> => {
      const stagedAsset = await brain.service.stageAsset(bytes);
      await brain.service.updateEntity({
        entity: { ...(await image()), content: stagedAsset.ref },
        stagedAsset,
      });
    };
    const syncedImage = async (): Promise<void> => {
      writeImage(png("first"));
      await brain.sync.importEntities(["image/cover.png"]);
    };

    it("replaces an image that has not changed in the brain", async () => {
      await syncedImage();
      writeImage(png("from the file"));

      const result = await brain.sync.importEntities(["image/cover.png"]);

      expect(result.imported).toBe(1);
      expect(same(await storedImage(), png("from the file"))).toBe(true);
    });

    it("never replaces an image that changed in the brain too: the file takes the brain's image", async () => {
      await syncedImage();
      await replaceInBrain(png("from the brain"));
      writeImage(png("from the file"));

      const result = await brain.sync.importEntities(["image/cover.png"]);

      expect(result.imported).toBe(0);
      expect(same(await storedImage(), png("from the brain"))).toBe(true);
      expect(
        same(readFileSync(file("image/cover.png")), png("from the brain")),
      ).toBe(true);
      // An image is not kept for the Inbox; the import says what happened.
      expect(brain.recorded).toEqual([]);
      expect((result.issues ?? []).map((issue) => issue.path)).toEqual([
        "image/cover.png",
      ]);
    });

    it("does not let an untouched image file replace a newer image", async () => {
      await syncedImage();
      await replaceInBrain(png("from the brain"));

      const result = await brain.sync.importEntities(["image/cover.png"]);

      expect(same(await storedImage(), png("from the brain"))).toBe(true);
      expect(result.issues ?? []).toEqual([]);
    });
  });
});
