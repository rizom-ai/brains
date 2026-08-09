import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseAssetRef,
  type BaseEntity,
  type EntityMutationResult,
} from "@brains/plugins";
import {
  createMockAssetsNamespace,
  createSilentLogger,
  createMockEntityService,
  createTestEntity,
  type MockAssetsNamespace,
} from "@brains/test-utils";
import { TINY_PDF_BYTES, TINY_PNG_BYTES } from "./fixtures";

describe("Image Import - Regression Tests", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  let assets: MockAssetsNamespace;
  let upsertedEntities: Array<{ entityType: string; id: string }>;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-image-import-"));

    upsertedEntities = [];
    assets = createMockAssetsNamespace();
    mockEntityService = createMockEntityService({
      entityTypes: ["topic", "image", "post", "document"],
    });

    spyOn(mockEntityService, "getEntityTypeConfig").mockImplementation(
      (entityType: string) =>
        entityType === "image" ? { binaryStorage: "asset" } : {},
    );

    spyOn(mockEntityService, "serializeEntity").mockImplementation(
      (entity: BaseEntity): string => `# ${entity.id}\n\n${entity.content}`,
    );

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(
      (): Partial<BaseEntity> => ({ metadata: {} }),
    );

    spyOn(mockEntityService, "upsertEntity").mockImplementation(
      async (request: {
        entity: Partial<BaseEntity>;
      }): Promise<EntityMutationResult & { created: boolean }> => {
        const entity = request.entity;
        upsertedEntities.push({
          entityType: entity.entityType ?? "unknown",
          id: entity.id ?? "unknown",
        });
        return {
          entityId: entity.id ?? "test-id",
          jobId: "test-job",
          created: true,
          skipped: false,
        };
      },
    );

    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      assets,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("importEntities should include image files", () => {
    it("should import image files from image/ directory when calling importEntities()", async () => {
      // Create topic markdown file
      mkdirSync(join(testDir, "topic"), { recursive: true });
      writeFileSync(
        join(testDir, "topic", "test-topic.md"),
        "# Test Topic\n\nContent",
      );

      // Create image files in image/ directory
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "photo.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "banner.png"), TINY_PNG_BYTES);

      // Import all entities (without specifying paths)
      const result = await dirSync.importEntities();

      // Should have imported 3 entities: 1 topic + 2 images
      expect(result.imported).toBe(3);
      expect(result.failed).toBe(0);

      // Verify the entity types that were upserted
      const topicEntities = upsertedEntities.filter(
        (e) => e.entityType === "topic",
      );
      const imageEntities = upsertedEntities.filter(
        (e) => e.entityType === "image",
      );

      expect(topicEntities).toHaveLength(1);
      expect(topicEntities[0]).toEqual({
        entityType: "topic",
        id: "test-topic",
      });

      expect(imageEntities).toHaveLength(2);
      expect(imageEntities.map((e) => e.id).sort()).toEqual([
        "banner",
        "photo",
      ]);
    });

    it("should persist binary images as durable asset references", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "test-image.png"), TINY_PNG_BYTES);

      let capturedEntity: Partial<BaseEntity> | undefined;
      spyOn(mockEntityService, "upsertEntity").mockImplementation(
        async (request: { entity: Partial<BaseEntity> }) => {
          const entity = request.entity;
          capturedEntity = entity;
          upsertedEntities.push({
            entityType: entity.entityType ?? "unknown",
            id: entity.id ?? "unknown",
          });
          return {
            entityId: entity.id ?? "test-id",
            jobId: "test-job",
            created: true,
            skipped: false,
          };
        },
      );

      const result = await dirSync.importEntities();

      expect(result.imported).toBe(1);
      expect(upsertedEntities[0]).toEqual({
        entityType: "image",
        id: "test-image",
      });
      const ref = parseAssetRef(capturedEntity?.content);
      expect(await assets.read(ref)).toEqual(TINY_PNG_BYTES);
      expect(capturedEntity?.metadata).toMatchObject({
        format: "png",
        mediaType: "image/png",
        sizeBytes: TINY_PNG_BYTES.byteLength,
        width: 1,
        height: 1,
      });
    });

    it("restores a missing referenced asset before skipping an unchanged image", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "restored.png"), TINY_PNG_BYTES);
      const expected = createMockAssetsNamespace().store.seed(TINY_PNG_BYTES);
      const existing = createTestEntity("image", {
        id: "restored",
        content: expected.ref,
        metadata: {
          format: "png",
          mediaType: "image/png",
          sizeBytes: expected.sizeBytes,
          width: 1,
          height: 1,
        },
      });
      spyOn(mockEntityService, "getEntity").mockResolvedValue(existing);
      const operations: string[] = [];
      spyOn(assets, "stat").mockImplementation(async (ref) => {
        operations.push("stat");
        return assets.store.stat(ref);
      });
      spyOn(assets, "putStream").mockImplementation(async (chunks, options) => {
        operations.push("putStream");
        return assets.store.putStream(chunks, options);
      });

      const result = await dirSync.importEntities(["image/restored.png"]);

      expect(result).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
      expect(operations).toEqual(["stat", "putStream"]);
      expect(await assets.stat(expected.ref)).not.toBeNull();
      expect(mockEntityService.deserializeEntity).not.toHaveBeenCalled();
      expect(mockEntityService.upsertEntity).not.toHaveBeenCalled();
    });

    it("skips an unchanged image only after confirming its asset exists", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "unchanged.png"), TINY_PNG_BYTES);
      const stored = assets.store.seed(TINY_PNG_BYTES);
      const existing = createTestEntity("image", {
        id: "unchanged",
        content: stored.ref,
        metadata: {
          format: "png",
          mediaType: "image/png",
          sizeBytes: stored.sizeBytes,
          width: 1,
          height: 1,
        },
      });
      spyOn(mockEntityService, "getEntity").mockResolvedValue(existing);
      const stat = spyOn(assets, "stat");
      const putStream = spyOn(assets, "putStream");

      const result = await dirSync.importEntities(["image/unchanged.png"]);

      expect(result).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
      expect(stat).toHaveBeenCalledWith(stored.ref);
      expect(putStream).not.toHaveBeenCalled();
      expect(mockEntityService.deserializeEntity).not.toHaveBeenCalled();
      expect(mockEntityService.upsertEntity).not.toHaveBeenCalled();
    });

    it("reports an oversized image as skipped and leaves the source in place", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      const sourcePath = join(testDir, "image", "oversized.png");
      writeFileSync(sourcePath, TINY_PNG_BYTES);
      const boundedSync = new DirectorySync({
        syncPath: testDir,
        entityService: mockEntityService,
        assets,
        logger: createSilentLogger("test"),
        maxAssetImportBytes: TINY_PNG_BYTES.byteLength - 1,
      });

      const result = await boundedSync.importEntities(["image/oversized.png"]);

      expect(result).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
      expect(result.issues?.[0]?.message).toContain(
        "exceeds asset import limit",
      );
      expect(existsSync(sourcePath)).toBe(true);
      expect(assets.store.contents.size).toBe(0);
    });

    it("should handle mixed import of markdown and images in single call", async () => {
      // Create various entity types
      mkdirSync(join(testDir, "topic"), { recursive: true });
      mkdirSync(join(testDir, "post"), { recursive: true });
      mkdirSync(join(testDir, "image"), { recursive: true });

      writeFileSync(join(testDir, "topic", "topic1.md"), "# Topic 1");
      writeFileSync(join(testDir, "topic", "topic2.md"), "# Topic 2");
      writeFileSync(join(testDir, "post", "blog-post.md"), "# Blog Post");
      writeFileSync(join(testDir, "image", "cover.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "inline.png"), TINY_PNG_BYTES);

      const result = await dirSync.importEntities();

      // Should import all 5 entities
      expect(result.imported).toBe(5);

      // Verify counts by type
      const topics = upsertedEntities.filter((e) => e.entityType === "topic");
      const posts = upsertedEntities.filter((e) => e.entityType === "post");
      const images = upsertedEntities.filter((e) => e.entityType === "image");

      expect(topics).toHaveLength(2);
      expect(posts).toHaveLength(1);
      expect(images).toHaveLength(2);
    });

    it("should NOT import image files from non-image directories", async () => {
      // Create image file in wrong directory (should be ignored)
      mkdirSync(join(testDir, "topic"), { recursive: true });
      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "topic", "misplaced.png"), TINY_PNG_BYTES);

      const result = await dirSync.importEntities();

      // Should only import the markdown file, not the misplaced PNG
      expect(result.imported).toBe(1);
      expect(upsertedEntities).toHaveLength(1);
      expect(upsertedEntities[0]).toEqual({ entityType: "topic", id: "test" });
    });
  });

  describe("importEntities should include document files", () => {
    it("should import PDF files from document/ directory when calling importEntities()", async () => {
      mkdirSync(join(testDir, "topic"), { recursive: true });
      mkdirSync(join(testDir, "document"), { recursive: true });

      writeFileSync(join(testDir, "topic", "test-topic.md"), "# Test Topic");
      writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);

      const result = await dirSync.importEntities();

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);

      const documentEntities = upsertedEntities.filter(
        (e) => e.entityType === "document",
      );

      expect(documentEntities).toEqual([
        { entityType: "document", id: "carousel" },
      ]);
    });

    it("should preserve document sidecar metadata when importing", async () => {
      mkdirSync(join(testDir, "document"), { recursive: true });
      writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);
      writeFileSync(
        join(testDir, "document", "carousel.pdf.meta.json"),
        JSON.stringify({
          filename: "carousel.pdf",
          pageCount: 4,
          dedupKey: "carousel:post-1",
        }),
      );

      spyOn(mockEntityService, "deserializeEntity").mockImplementation(
        (): Partial<BaseEntity> => ({
          metadata: {
            mimeType: "application/pdf",
            filename: "document.pdf",
          },
        }),
      );

      let capturedMetadata: Record<string, unknown> | undefined;
      spyOn(mockEntityService, "upsertEntity").mockImplementation(
        async (request: { entity: Partial<BaseEntity> }) => {
          const entity = request.entity;
          capturedMetadata = entity.metadata;
          return {
            entityId: entity.id ?? "test-id",
            jobId: "test-job",
            created: true,
            skipped: false,
          };
        },
      );

      const result = await dirSync.importEntities();

      expect(result.imported).toBe(1);
      expect(capturedMetadata).toEqual({
        mimeType: "application/pdf",
        filename: "carousel.pdf",
        pageCount: 4,
        dedupKey: "carousel:post-1",
      });
    });

    it("should convert binary PDFs to application/pdf data URLs when importing", async () => {
      mkdirSync(join(testDir, "document"), { recursive: true });
      writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);

      let capturedContent: string | undefined;
      spyOn(mockEntityService, "upsertEntity").mockImplementation(
        async (request: { entity: Partial<BaseEntity> }) => {
          const entity = request.entity;
          capturedContent = entity.content;
          upsertedEntities.push({
            entityType: entity.entityType ?? "unknown",
            id: entity.id ?? "unknown",
          });
          return {
            entityId: entity.id ?? "test-id",
            jobId: "test-job",
            created: true,
            skipped: false,
          };
        },
      );

      const result = await dirSync.importEntities();

      expect(result.imported).toBe(1);
      expect(upsertedEntities[0]).toEqual({
        entityType: "document",
        id: "carousel",
      });
      expect(capturedContent).toMatch(/^data:application\/pdf;base64,/);
    });
  });
});
