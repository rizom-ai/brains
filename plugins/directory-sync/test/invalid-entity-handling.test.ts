import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import { createSilentLogger } from "@brains/utils";

describe("Invalid Entity Handling", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: IEntityService;
  let deserializeError: Error | null = null;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `test-invalid-entity-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create mock entity service that can simulate failures
    mockEntityService = {
      serializeEntity: (entity: BaseEntity): string => {
        return `# ${entity.id}\n\n${entity.content}`;
      },
      deserializeEntity: (
        _content: string,
        _entityType: string,
      ): Partial<BaseEntity> => {
        if (deserializeError) {
          throw deserializeError;
        }
        return { metadata: {} };
      },
      getEntity: async (
        _entityType: string,
        _id: string,
      ): Promise<BaseEntity | null> => {
        return null; // No existing entities
      },
      createEntity: async (
        entity: Partial<BaseEntity>,
      ): Promise<{ entityId: string; jobId: string }> => {
        return { entityId: entity.id ?? "test-id", jobId: "test-job" };
      },
      updateEntity: async (
        _entity: BaseEntity,
      ): Promise<{ entityId: string; jobId: string }> => {
        return { entityId: _entity.id, jobId: "test-job" };
      },
      upsertEntity: async (
        entity: Partial<BaseEntity>,
      ): Promise<{ entityId: string; jobId: string; created: boolean }> => {
        return {
          entityId: entity.id ?? "test-id",
          jobId: "test-job",
          created: true,
        };
      },
      deleteEntity: async (
        _entityType: string,
        _id: string,
      ): Promise<boolean> => {
        return true;
      },
      listEntities: async (
        _entityType: string,
        _options?: { limit?: number; offset?: number },
      ): Promise<BaseEntity[]> => {
        return [];
      },
      search: async (
        _query: string,
        _options?: {
          types?: string[];
          limit?: number;
          sortBy?: string;
          sortDirection?: "asc" | "desc";
        },
      ): Promise<BaseEntity[]> => {
        return [];
      },
      getEntityTypes: (): string[] => {
        return ["note", "summary", "topic"];
      },
      hasEntityType: (entityType: string): boolean => {
        return ["note", "summary", "topic"].includes(entityType);
      },
      getAsyncJobStatus: async (
        _jobId: string,
      ): Promise<{ status: "completed"; progress: number }> => {
        return { status: "completed" as const, progress: 100 };
      },
      storeEntityWithEmbedding: async (_data: {
        id: string;
        entityType: string;
        content: string;
        metadata: Record<string, unknown>;
        created: number;
        updated: number;
        contentWeight: number;
        embedding: Float32Array;
      }): Promise<void> => {
        // Mock implementation - does nothing
      },
    } as unknown as IEntityService;

    // Create directory sync instance
    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    deserializeError = null;
  });

  describe("Quarantine Invalid Files", () => {
    it("should rename invalid markdown files to .md.invalid", async () => {
      // Create a markdown file that will fail deserialization
      const invalidFile = join(testDir, "note", "invalid-entity.md");
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(invalidFile, "This is invalid markdown content");

      // Set up deserialization to fail
      deserializeError = new Error("Invalid entity format");

      // Attempt import
      const result = await dirSync.importEntities(["note/invalid-entity.md"]);

      // Check that file was renamed
      expect(existsSync(invalidFile)).toBe(false);
      expect(existsSync(`${invalidFile}.invalid`)).toBe(true);

      // Check result counts
      expect(result.imported).toBe(0);
      expect(result.quarantined).toBe(1);
      expect(result.quarantinedFiles).toContain("note/invalid-entity.md");
    });

    it("should handle multiple invalid files", async () => {
      // Create multiple invalid files
      mkdirSync(join(testDir, "summary"), { recursive: true });
      mkdirSync(join(testDir, "topic"), { recursive: true });

      const files = [
        join(testDir, "summary", "broken1.md"),
        join(testDir, "summary", "broken2.md"),
        join(testDir, "topic", "malformed.md"),
      ];

      files.forEach((file) => {
        writeFileSync(file, "Invalid content");
      });

      // Set up deserialization to fail
      deserializeError = new Error("Parse error");

      // Import all
      const result = await dirSync.importEntities();

      // All should be quarantined
      expect(result.quarantined).toBe(3);
      expect(result.imported).toBe(0);

      // Check all files renamed
      files.forEach((file) => {
        expect(existsSync(file)).toBe(false);
        expect(existsSync(`${file}.invalid`)).toBe(true);
      });
    });

    it("should not re-process .invalid files", async () => {
      // Create an already quarantined file
      const invalidFile = join(testDir, "note", "already-invalid.md.invalid");
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(invalidFile, "Already quarantined");

      // Import should skip it
      const result = await dirSync.importEntities();

      expect(result.skipped).toBe(0);
      expect(result.quarantined).toBe(0);
      expect(result.imported).toBe(0);

      // File should remain untouched
      expect(existsSync(invalidFile)).toBe(true);
    });

    it("should handle mixed valid and invalid entities", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });

      // Create one valid and one invalid file
      const validFile = join(testDir, "note", "valid.md");
      const invalidFile = join(testDir, "note", "invalid.md");

      writeFileSync(validFile, "# Valid Note\n\nValid content");
      writeFileSync(invalidFile, "Invalid content");

      // Make only the invalid file fail
      mockEntityService.deserializeEntity = (
        content: string,
      ): Partial<BaseEntity> => {
        if (content.includes("Invalid")) {
          throw new Error("Invalid format");
        }
        return { metadata: {} };
      };

      const result = await dirSync.importEntities();

      // Valid file should import
      expect(result.imported).toBe(1);

      // Invalid file should be quarantined
      expect(result.quarantined).toBe(1);
      expect(existsSync(validFile)).toBe(true);
      expect(existsSync(invalidFile)).toBe(false);
      expect(existsSync(`${invalidFile}.invalid`)).toBe(true);
    });
  });

  describe("Error Logging", () => {
    it("should create .import-errors.log for failed imports", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });
      const invalidFile = join(testDir, "note", "broken.md");
      writeFileSync(invalidFile, "Broken content");

      deserializeError = new Error("Failed to parse frontmatter");

      await dirSync.importEntities(["note/broken.md"]);

      const errorLog = join(testDir, ".import-errors.log");
      expect(existsSync(errorLog)).toBe(true);

      const logContent = readFileSync(errorLog, "utf-8");
      expect(logContent).toContain("note/broken.md");
      expect(logContent).toContain("Failed to parse frontmatter");
    });

    it("should append to existing error log", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });

      // Create initial error log
      const errorLog = join(testDir, ".import-errors.log");
      writeFileSync(errorLog, "=== Previous Errors ===\n");

      // Create and import invalid file
      const invalidFile = join(testDir, "note", "new-error.md");
      writeFileSync(invalidFile, "Invalid");

      deserializeError = new Error("New error");

      await dirSync.importEntities(["note/new-error.md"]);

      const logContent = readFileSync(errorLog, "utf-8");
      expect(logContent).toContain("Previous Errors");
      expect(logContent).toContain("note/new-error.md");
      expect(logContent).toContain("New error");
    });

    it("should include timestamp in error log", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });
      const invalidFile = join(testDir, "note", "timestamped.md");
      writeFileSync(invalidFile, "Invalid");

      deserializeError = new Error("Parse failed");

      const before = new Date();
      await dirSync.importEntities(["note/timestamped.md"]);
      const after = new Date();

      const errorLog = join(testDir, ".import-errors.log");
      const logContent = readFileSync(errorLog, "utf-8");

      // Check for ISO timestamp format with milliseconds
      const timestampMatch = logContent.match(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
      );
      expect(timestampMatch).toBeTruthy();

      if (timestampMatch) {
        const loggedTime = new Date(timestampMatch[0]);
        expect(loggedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(loggedTime.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });

    it("should format error log entries clearly", async () => {
      mkdirSync(join(testDir, "summary", "daily"), { recursive: true });
      const invalidFile = join(testDir, "summary", "daily", "2024-01-27.md");
      writeFileSync(invalidFile, "Malformed");

      deserializeError = new Error("Missing required field: conversationId");

      await dirSync.importEntities(["summary/daily/2024-01-27.md"]);

      const errorLog = join(testDir, ".import-errors.log");
      const logContent = readFileSync(errorLog, "utf-8");

      // Check for clear formatting
      expect(logContent).toMatch(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*summary\/daily\/2024-01-27\.md/,
      );
      expect(logContent).toContain("Missing required field: conversationId");
      expect(logContent).toContain("→ summary/daily/2024-01-27.md.invalid");
    });
  });

  describe("Recovery Workflow", () => {
    it("should successfully import fixed files when renamed back", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });

      // Create an invalid file
      const originalPath = join(testDir, "note", "fixable.md");
      writeFileSync(originalPath, "Invalid content");

      // First import fails
      deserializeError = new Error("Parse error");
      let result = await dirSync.importEntities(["note/fixable.md"]);

      expect(result.quarantined).toBe(1);
      expect(existsSync(`${originalPath}.invalid`)).toBe(true);

      // Fix the content
      writeFileSync(`${originalPath}.invalid`, "# Fixed Note\n\nNow valid");

      // Rename back
      rmSync(originalPath, { force: true });
      writeFileSync(
        originalPath,
        readFileSync(`${originalPath}.invalid`, "utf-8"),
      );
      rmSync(`${originalPath}.invalid`);

      // Clear the error for next import
      deserializeError = null;

      // Import should now succeed
      result = await dirSync.importEntities(["note/fixable.md"]);

      expect(result.imported).toBe(1);
      expect(result.quarantined).toBe(0);
      expect(existsSync(originalPath)).toBe(true);
      expect(existsSync(`${originalPath}.invalid`)).toBe(false);
    });

    it("should clear error log entries for successfully recovered files", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });

      const file1 = join(testDir, "note", "error1.md");
      const file2 = join(testDir, "note", "error2.md");

      writeFileSync(file1, "Invalid 1");
      writeFileSync(file2, "Invalid 2");

      // Import with errors
      deserializeError = new Error("Parse failed");
      await dirSync.importEntities();

      // Fix one file
      writeFileSync(file1, "# Fixed\n\nValid now");
      rmSync(`${file1}.invalid`);

      // Clear error and reimport
      deserializeError = null;
      await dirSync.importEntities(["note/error1.md"]);

      const errorLog = join(testDir, ".import-errors.log");
      const logContent = readFileSync(errorLog, "utf-8");

      // Should still have error2 but not error1
      expect(logContent).toContain("note/error2.md");
      expect(logContent).toMatch(/\[RECOVERED\].*note\/error1\.md/);
    });
  });

  describe("ImportResult Updates", () => {
    it("should include quarantined count in ImportResult", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });

      writeFileSync(join(testDir, "note", "valid.md"), "# Valid");
      writeFileSync(join(testDir, "note", "invalid.md"), "Invalid");

      mockEntityService.deserializeEntity = (
        content: string,
      ): Partial<BaseEntity> => {
        if (content.includes("Invalid")) {
          throw new Error("Invalid");
        }
        return { metadata: {} };
      };

      const result = await dirSync.importEntities();

      expect(result).toHaveProperty("imported", 1);
      expect(result).toHaveProperty("quarantined", 1);
      expect(result).toHaveProperty("skipped", 0);
      expect(result).toHaveProperty("failed", 0);
      expect(result).toHaveProperty("quarantinedFiles");
      expect(result.quarantinedFiles).toHaveLength(1);
      expect(result.quarantinedFiles[0]).toBe("note/invalid.md");
    });

    it("should track all quarantined files in result", async () => {
      mkdirSync(join(testDir, "summary"), { recursive: true });
      mkdirSync(join(testDir, "topic"), { recursive: true });

      const files = [
        "summary/broken1.md",
        "summary/broken2.md",
        "topic/malformed.md",
      ];

      files.forEach((file) => {
        writeFileSync(join(testDir, file), "Invalid");
      });

      deserializeError = new Error("Parse error");
      const result = await dirSync.importEntities();

      expect(result.quarantinedFiles).toHaveLength(3);
      expect(result.quarantinedFiles).toEqual(expect.arrayContaining(files));
    });
  });
});
