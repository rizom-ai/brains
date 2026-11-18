import { createMockEntityService } from "@brains/entity-service/test";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BaseEntity } from "@brains/plugins";
import { computeAssetDigest, createAssetRef } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";
import { TINY_PDF_BYTES, TINY_PDF_DATA_URL } from "./fixtures";

/**
 * A PDF file of an asset-backed document type is staged from a file stream
 * and stored as its reference; its sidecar is the document's metadata.
 */
describe("importing a PDF file of an asset-backed document type", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  const ref = createAssetRef(computeAssetDigest(TINY_PDF_BYTES));

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-document-import-"));
    mockEntityService = createMockEntityService({
      entityTypes: ["document"],
    });
    spyOn(mockEntityService, "getEntityTypeConfig").mockImplementation(
      (type: string) => (type === "document" ? { binaryStorage: "asset" } : {}),
    );
    spyOn(mockEntityService, "serializeEntity").mockImplementation(
      (entity: BaseEntity): string => entity.content,
    );
    spyOn(mockEntityService, "deserializeEntity").mockImplementation(
      (): Partial<BaseEntity> => ({ metadata: {} }),
    );
    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });
    mkdirSync(join(testDir, "document"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  function captureUpserts(): Array<{
    entity: Partial<BaseEntity>;
    stagedAsset?: unknown;
  }> {
    const requests: Array<{
      entity: Partial<BaseEntity>;
      stagedAsset?: unknown;
    }> = [];
    spyOn(mockEntityService, "upsertEntity").mockImplementation(
      async (request: {
        entity: Partial<BaseEntity>;
        stagedAsset?: unknown;
      }) => {
        requests.push(request);
        return {
          entityId: request.entity.id ?? "test-id",
          jobId: "test-job",
          created: true,
          skipped: false,
        };
      },
    );
    return requests;
  }

  function writePdf(sidecar?: Record<string, unknown>): void {
    writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);
    if (sidecar) {
      writeFileSync(
        join(testDir, "document", "carousel.pdf.meta.json"),
        JSON.stringify(sidecar),
      );
    }
  }

  function store(content: string, metadata: Record<string, unknown>): void {
    const stored: BaseEntity = {
      id: "carousel",
      entityType: "document",
      content,
      contentHash: "stored",
      metadata,
      visibility: "public",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    };
    mockEntityService.getEntityWriteSnapshot = async (): Promise<{
      entity: BaseEntity;
      revision: string;
    }> => ({ entity: stored, revision: "stored" });
  }

  it("stages the file from a stream and upserts its reference with the sidecar's metadata", async () => {
    writePdf({ filename: "carousel.pdf", pageCount: 4 });
    const upserts = captureUpserts();
    const stage = spyOn(mockEntityService, "stageAsset");

    const result = await dirSync.importEntities();

    expect(result.imported).toBe(1);
    expect(upserts[0]?.entity.content).toBe(ref);
    expect(upserts[0]?.entity.metadata).toEqual({
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      pageCount: 4,
      sizeBytes: TINY_PDF_BYTES.byteLength,
    });
    expect(upserts[0]?.stagedAsset).toMatchObject({ ref });
    const source = stage.mock.calls[0]?.[0];
    expect(source instanceof Uint8Array).toBe(false);
    expect(Symbol.asyncIterator in Object(source)).toBe(true);
  });

  it("skips a file whose bytes and sidecar match the stored document, without staging", async () => {
    writePdf({ filename: "carousel.pdf" });
    store(ref, {
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      sizeBytes: TINY_PDF_BYTES.byteLength,
    });
    const upserts = captureUpserts();
    const stage = spyOn(mockEntityService, "stageAsset");

    const result = await dirSync.importEntities();

    expect(result.skipped).toBe(1);
    expect(upserts).toHaveLength(0);
    expect(stage).not.toHaveBeenCalled();
  });

  it("leaves an inline document whose bytes and sidecar match for the offline migration", async () => {
    writePdf({ filename: "carousel.pdf" });
    store(TINY_PDF_DATA_URL, {
      mimeType: "application/pdf",
      filename: "carousel.pdf",
    });
    const upserts = captureUpserts();

    const result = await dirSync.importEntities();

    expect(result.skipped).toBe(1);
    expect(upserts).toHaveLength(0);
  });

  it("keeps the stored bytes and takes a changed sidecar's metadata", async () => {
    writePdf({ filename: "carousel.pdf", title: "Renamed" });
    store(ref, {
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      sizeBytes: TINY_PDF_BYTES.byteLength,
    });
    const upserts = captureUpserts();
    const stage = spyOn(mockEntityService, "stageAsset");

    const result = await dirSync.importEntities();

    expect(result.imported).toBe(1);
    expect(stage).not.toHaveBeenCalled();
    expect(upserts[0]?.entity.content).toBe(ref);
    expect(upserts[0]?.stagedAsset).toBeUndefined();
    expect(upserts[0]?.entity.metadata).toMatchObject({ title: "Renamed" });
  });

  it("reports a file that is not a PDF and leaves it in place", async () => {
    writeFileSync(
      join(testDir, "document", "carousel.pdf"),
      Buffer.from("hello"),
    );
    const upserts = captureUpserts();

    const result = await dirSync.importEntities();

    expect(upserts).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(JSON.stringify(result)).toContain("not a PDF");
    expect(existsSync(join(testDir, "document", "carousel.pdf"))).toBe(true);
  });
});
