import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { BaseEntity } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { TINY_PDF_BYTES } from "./fixtures";

/**
 * Regression tests: contentHash should be hash of canonical (serialized) form,
 * not the raw file content.
 *
 * Bug: import pipeline stores contentHash = hash(rawContent). After import,
 * auto-sync writes canonical form to disk. File watcher triggers re-import.
 * shouldUpdateEntity compares hash(canonical) vs hash(raw) → differ → re-imports
 * unnecessarily.
 *
 * Fix: store contentHash = hash(serializeEntity(entity)). Then hash(canonical
 * file) == DB hash(canonical) → shouldUpdateEntity returns false → no re-import.
 */
describe("contentHash regression: canonical form, not raw content", () => {
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;

  // Mock serializer wraps content in frontmatter — canonical ≠ raw
  const toCanonical = (entity: Partial<BaseEntity>): string =>
    `---\ntitle: ${entity.id ?? ""}\n---\n\n${entity.content ?? ""}`;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-canonical-hash-"));
    mkdirSync(join(testDir, "note"), { recursive: true });

    mockEntityService = createMockEntityService({ entityTypes: ["note"] });
    spyOn(mockEntityService, "serializeEntity").mockImplementation(toCanonical);
    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => ({
      metadata: {},
    }));
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("upserted entity.contentHash should equal hash of canonical form, not raw content", async () => {
    const rawContent = "Hello world";
    writeFileSync(join(testDir, "note", "my-note.md"), rawContent);

    let capturedEntity: Partial<BaseEntity> | undefined;
    spyOn(mockEntityService, "upsertEntity").mockImplementation(
      async (request: { entity: Partial<BaseEntity> }) => {
        const entity = request.entity;
        capturedEntity = entity;
        return {
          entityId: entity.id ?? "mock-entity-id",
          jobId: "mock-job",
          created: true,
          skipped: false,
        };
      },
    );

    const dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });

    await dirSync.importEntities(["note/my-note.md"]);

    expect(capturedEntity).toBeDefined();
    if (!capturedEntity) return;

    const rawHash = computeContentHash(rawContent);
    const canonicalHash = computeContentHash(toCanonical(capturedEntity));

    expect(capturedEntity.contentHash).not.toBe(rawHash); // should NOT be raw hash
    expect(capturedEntity.contentHash).toBe(canonicalHash); // should BE canonical hash
  });

  it("re-importing canonical content (auto-sync write) should be skipped, not re-imported", async () => {
    const rawContent = "Hello world";

    // In-memory store to track entities across two imports
    const store = new Map<string, Partial<BaseEntity>>();
    spyOn(mockEntityService, "upsertEntity").mockImplementation(
      async (request: { entity: Partial<BaseEntity> }) => {
        const entity = request.entity;
        store.set(`${entity.entityType}:${entity.id}`, entity);
        return {
          entityId: entity.id ?? "mock-entity-id",
          jobId: "mock-job",
          created: true,
          skipped: false,
        };
      },
    );
    mockEntityService.getEntity = async <T extends BaseEntity>(request: {
      entityType: string;
      id: string;
    }): Promise<T | null> => {
      const found = store.get(`${request.entityType}:${request.id}`);
      return found ? (found as T) : null;
    };

    const dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });

    // Phase 1: import raw file
    writeFileSync(join(testDir, "note", "my-note.md"), rawContent);
    const result1 = await dirSync.importEntities(["note/my-note.md"]);
    expect(result1.imported).toBe(1);

    // Phase 2: simulate auto-sync writing canonical form to disk
    const storedEntity = store.get("note:my-note");
    expect(storedEntity).toBeDefined();
    if (!storedEntity) return;

    const canonicalContent = toCanonical(storedEntity);
    writeFileSync(join(testDir, "note", "my-note.md"), canonicalContent);

    // Phase 3: re-import canonical file (simulating file watcher trigger after auto-sync)
    const result2 = await dirSync.importEntities(["note/my-note.md"]);

    // Should skip before parsing — canonical content on disk matches the
    // canonical hash in DB.
    expect(result2.skipped).toBe(1);
    expect(result2.imported).toBe(0);
    expect(mockEntityService.deserializeEntity).toHaveBeenCalledTimes(1);

    // A genuine content change still parses and imports.
    writeFileSync(
      join(testDir, "note", "my-note.md"),
      `${canonicalContent}\nChanged`,
    );
    const result3 = await dirSync.importEntities(["note/my-note.md"]);
    expect(result3.imported).toBe(1);
    expect(mockEntityService.deserializeEntity).toHaveBeenCalledTimes(2);
  });

  it("imports a document metadata-only sidecar change", async () => {
    mkdirSync(join(testDir, "document"), { recursive: true });
    const documentPath = join(testDir, "document", "report.pdf");
    const sidecarPath = `${documentPath}.meta.json`;
    writeFileSync(documentPath, TINY_PDF_BYTES);
    writeFileSync(
      sidecarPath,
      `${JSON.stringify({ filename: "report.pdf", pageCount: 1 })}\n`,
    );

    const dataUrl = `data:application/pdf;base64,${TINY_PDF_BYTES.toString("base64")}`;
    const existing: BaseEntity = {
      id: "report",
      entityType: "document",
      content: dataUrl,
      visibility: "public",
      metadata: {
        mimeType: "application/pdf",
        filename: "report.pdf",
        pageCount: 1,
      },
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      contentHash: computeContentHash(dataUrl),
    };
    const documentService = createMockEntityService({
      entityTypes: ["document"],
    });
    const getEntity = spyOn(documentService, "getEntity").mockResolvedValue(
      existing,
    );
    const deserialize = spyOn(
      documentService,
      "deserializeEntity",
    ).mockReturnValue({ entityType: "document", content: dataUrl });
    const upsert = spyOn(documentService, "upsertEntity");
    const dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: documentService,
      logger: createSilentLogger("document-sidecar-short-circuit"),
    });

    const unchanged = await dirSync.importEntities(["document/report.pdf"]);
    expect(unchanged.skipped).toBe(1);
    expect(deserialize).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();

    writeFileSync(
      sidecarPath,
      `${JSON.stringify({ filename: "report.pdf", pageCount: 2 })}\n`,
    );
    const metadataChanged = await dirSync.importEntities([
      "document/report.pdf",
    ]);

    expect(metadataChanged.imported).toBe(1);
    expect(deserialize).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(getEntity).toHaveBeenCalledTimes(2);
  });
});
