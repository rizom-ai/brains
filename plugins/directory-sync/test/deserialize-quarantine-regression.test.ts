import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

/**
 * Regression tests for quarantine behavior during deserialization.
 *
 * Bug: The import pipeline quarantined files unconditionally on ANY
 * deserialization error, including transient errors like "No adapter
 * registered for entity type". These files should NOT be quarantined
 * because the error is transient (adapter not yet registered) rather
 * than a permanent validation failure (malformed frontmatter).
 *
 * Valid quarantine reasons: ZodError, invalid_type, Required, etc.
 * Invalid quarantine reasons: "No adapter registered", runtime errors
 */
describe("Deserialize error quarantine behavior", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-quarantine-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    mockEntityService = createMockEntityService({
      entityTypes: ["brain-character", "anchor-profile", "post"],
    });

    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should NOT quarantine files when adapter is not registered (transient error)", async () => {
    // Simulate "No adapter registered for entity type" — a transient error
    // that happens when directory-sync imports before shell registers adapters
    mkdirSync(join(testDir, "brain-character"), { recursive: true });
    const filePath = join(testDir, "brain-character", "brain-character.md");
    writeFileSync(
      filePath,
      "---\nname: Team Brain\nrole: coordinator\npurpose: help\nvalues:\n  - clarity\n---\n",
    );

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => {
      throw new Error(
        "Entity type registration failed for brain-character: No adapter registered for entity type",
      );
    });

    const result = await dirSync.importEntities([
      "brain-character/brain-character.md",
    ]);

    // File should NOT be quarantined — the error is transient
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    // Should be counted as failed (transient), not quarantined
    expect(result.failed).toBe(1);
  });

  it("should NOT quarantine files on generic runtime errors", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    const filePath = join(testDir, "post", "hello.md");
    writeFileSync(filePath, "---\ntitle: hello\n---\n");

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => {
      throw new Error("Database connection lost");
    });

    const result = await dirSync.importEntities(["post/hello.md"]);

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("should STILL quarantine files on Zod validation errors", async () => {
    const { z } = await import("@brains/utils");

    mkdirSync(join(testDir, "post"), { recursive: true });
    const filePath = join(testDir, "post", "bad.md");
    writeFileSync(filePath, "---\ntitle: bad\n---\n");

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => {
      throw new z.ZodError([
        {
          code: "invalid_type",
          expected: "string",
          received: "undefined",
          path: ["title"],
          message: "Required",
        },
      ]);
    });

    const result = await dirSync.importEntities(["post/bad.md"]);

    // File SHOULD be quarantined — this is a real validation error
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}.invalid`)).toBe(true);
    expect(result.quarantined).toBe(1);
  });

  it("should STILL quarantine files on string validation errors", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    const filePath = join(testDir, "post", "bad2.md");
    writeFileSync(filePath, "---\ntitle: bad\n---\n");

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => {
      throw new Error("Invalid frontmatter: missing required field");
    });

    const result = await dirSync.importEntities(["post/bad2.md"]);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}.invalid`)).toBe(true);
    expect(result.quarantined).toBe(1);
  });

  it("should NOT quarantine anchor-profile when adapter not registered", async () => {
    mkdirSync(join(testDir, "anchor-profile"), { recursive: true });
    const filePath = join(testDir, "anchor-profile", "anchor-profile.md");
    writeFileSync(
      filePath,
      "---\nname: Team\ndescription: A team workspace\n---\n",
    );

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => {
      throw new Error(
        "Entity type registration failed for anchor-profile: No adapter registered for entity type",
      );
    });

    const result = await dirSync.importEntities([
      "anchor-profile/anchor-profile.md",
    ]);

    // Original file preserved, no quarantine
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    expect(result.failed).toBe(1);
  });
});
