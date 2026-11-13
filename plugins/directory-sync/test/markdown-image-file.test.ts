import {
  createMockEntityService,
  createTestEntity,
} from "@brains/entity-service/test";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BaseEntity, EntityMutationResult } from "@brains/plugins";
import { imageMetadataFor } from "@brains/image";
import { createSilentLogger } from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";
import { TINY_PNG_BYTES, TINY_PNG_DATA_URL } from "./fixtures";

/** A 1x1 JPEG, to change the image's bytes and format. */
const TINY_JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/** The seed's form: an image kept as a markdown file holding its data URL. */
const MARKDOWN_FILE = `${TINY_PNG_DATA_URL}\n`;

describe("an image kept as a markdown data URL file", () => {
  let testDir: string;
  let imported: Partial<BaseEntity>[];
  let entityService: ReturnType<typeof createMockEntityService>;
  let dirSync: DirectorySync;

  const markdownPath = (): string =>
    join(testDir, "image", "relay-diagram-placeholder.md");

  /** The image row as import stored it from the markdown file. */
  function importedImage(): BaseEntity {
    const entity = imported.find((e) => e.entityType === "image");
    if (!entity?.content) throw new Error("Expected an imported image");
    return createTestEntity("image", {
      id: entity.id ?? "",
      content: entity.content,
      metadata: entity.metadata ?? {},
    });
  }

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "markdown-image-file-"));
    mkdirSync(join(testDir, "image"), { recursive: true });
    writeFileSync(markdownPath(), MARKDOWN_FILE);

    imported = [];
    entityService = createMockEntityService({ entityTypes: ["image"] });
    // As the image type decodes: the bytes say the format.
    spyOn(entityService, "deserializeEntity").mockImplementation(
      (content: string): Partial<BaseEntity> => ({
        content,
        metadata: imageMetadataFor(content),
      }),
    );
    spyOn(entityService, "serializeEntity").mockImplementation(
      (entity: BaseEntity): string => entity.content,
    );
    spyOn(entityService, "upsertEntity").mockImplementation(
      async (request: {
        entity: Partial<BaseEntity>;
      }): Promise<EntityMutationResult & { created: boolean }> => {
        imported.push(request.entity);
        return {
          entityId: request.entity.id ?? "",
          jobId: "job",
          created: true,
          skipped: false,
        };
      },
    );
    spyOn(entityService, "deleteEntity").mockResolvedValue(true);

    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService,
      logger: createSilentLogger("markdown-image-file"),
    });

    const result = await dirSync.importEntities();
    expect(result.imported).toBe(1);
    spyOn(entityService, "listEntities").mockResolvedValue([importedImage()]);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("is imported with the format its bytes say", () => {
    expect(importedImage()).toMatchObject({
      id: "relay-diagram-placeholder",
      metadata: { format: "png" },
    });
  });

  it("survives an orphan cleanup pass", async () => {
    const result = await dirSync.removeOrphanedEntities();

    expect(result.deleted).toBe(0);
    expect(entityService.deleteEntity).not.toHaveBeenCalled();
    expect(readFileSync(markdownPath(), "utf8")).toBe(MARKDOWN_FILE);
  });

  it("survives a quarantined markdown file", async () => {
    writeFileSync(`${markdownPath()}.invalid`, MARKDOWN_FILE);
    rmSync(markdownPath());

    const result = await dirSync.removeOrphanedEntities();

    expect(result.deleted).toBe(0);
    expect(entityService.deleteEntity).not.toHaveBeenCalled();
  });

  it("exports to its markdown file, leaving no binary file beside it", async () => {
    const result = await dirSync.exportEntities(["image"]);

    expect(result.failed).toBe(0);
    expect(entityService.deleteEntity).not.toHaveBeenCalled();
    expect(readdirSync(join(testDir, "image"))).toEqual([
      "relay-diagram-placeholder.md",
    ]);
    expect(readFileSync(markdownPath(), "utf8")).toBe(MARKDOWN_FILE);
  });

  it("writes changed bytes into its markdown file as a data URL", async () => {
    await dirSync.fileOps.writeEntity(
      createTestEntity("image", {
        id: "relay-diagram-placeholder",
        content: TINY_JPEG_DATA_URL,
        metadata: { format: "jpeg" },
      }),
    );

    expect(readdirSync(join(testDir, "image"))).toEqual([
      "relay-diagram-placeholder.md",
    ]);
    expect(readFileSync(markdownPath(), "utf8")).toBe(TINY_JPEG_DATA_URL);
  });

  it("writes the exact bytes of a stored data URL that ends in a newline", async () => {
    // The row import stores from the markdown file keeps the file's newline.
    await dirSync.fileOps.writeEntity(
      createTestEntity("image", {
        id: "binary-copy",
        content: MARKDOWN_FILE,
        metadata: { format: "png" },
      }),
    );

    expect(
      readFileSync(join(testDir, "image", "binary-copy.png")).equals(
        TINY_PNG_BYTES,
      ),
    ).toBe(true);
  });

  it("clears a pulled deletion of its markdown file once cleanup deletes it", async () => {
    rmSync(markdownPath());
    await dirSync.recordPendingPullDeletes([
      "image/relay-diagram-placeholder.md",
    ]);
    expect(dirSync.isPendingDelete("image", "relay-diagram-placeholder")).toBe(
      true,
    );

    const result = await dirSync.removeOrphanedEntities();

    expect(result.deleted).toBe(1);
    expect(dirSync.isPendingDelete("image", "relay-diagram-placeholder")).toBe(
      false,
    );
  });

  it("is removed by cleanup once its markdown file is gone", async () => {
    rmSync(markdownPath());

    const result = await dirSync.removeOrphanedEntities();

    expect(result.deleted).toBe(1);
    expect(existsSync(join(testDir, "image"))).toBe(true);
  });
});
