import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilesystemBinaryAssetMigrationState,
  type BinaryAssetMigrationManifestEntry,
} from "../src/lib/binary-asset-migration-state";
import { createAssetRef } from "@brains/assets";

const DIGEST = "a".repeat(64);
const REF = createAssetRef(DIGEST);
const ENTRY: BinaryAssetMigrationManifestEntry = {
  entityId: "hero",
  oldContentHash: "legacy-hash",
  assetDigest: DIGEST,
  mediaType: "image/png",
  sizeBytes: 100,
  status: "completed",
  outcome: "migrated",
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createState(): {
  directory: string;
  state: FilesystemBinaryAssetMigrationState;
} {
  const directory = mkdtempSync(join(tmpdir(), "binary-asset-state-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    state: new FilesystemBinaryAssetMigrationState({
      stateDirectory: directory,
      entityType: "image",
    }),
  };
}

describe("binary asset migration state", () => {
  test("journals only verified digest facts and resumes matching assets", async () => {
    const { directory, state } = createState();

    await state.recordVerifiedAsset({
      entityId: "hero",
      oldContentHash: "legacy-hash",
      ref: REF,
      mediaType: "image/png",
      sizeBytes: 100,
    });

    expect(
      await state.canReuseVerifiedAsset({
        entityId: "hero",
        oldContentHash: "legacy-hash",
        ref: REF,
        mediaType: "image/png",
        sizeBytes: 100,
      }),
    ).toBe(true);
    const journal = readFileSync(
      join(directory, "image-prewrite-journal.json"),
      "utf8",
    );
    expect(journal).not.toContain("data:image/");
    expect(journal).not.toContain("base64");
    expect(journal).not.toContain("asset://");
    expect(journal).toContain(DIGEST);
  });

  test("does not reuse a journal entry after source facts change", async () => {
    const { state } = createState();
    await state.recordVerifiedAsset({
      entityId: "hero",
      oldContentHash: "legacy-hash",
      ref: REF,
      mediaType: "image/png",
      sizeBytes: 100,
    });

    expect(
      await state.canReuseVerifiedAsset({
        entityId: "hero",
        oldContentHash: "different-hash",
        ref: REF,
        mediaType: "image/png",
        sizeBytes: 100,
      }),
    ).toBe(false);
  });

  test("rejects manifest fields containing encoded image payload markers", async () => {
    const { directory, state } = createState();

    expect(
      state.complete({
        migratedCount: 1,
        verifiedCount: 0,
        entries: [
          {
            ...ENTRY,
            status: "data:image/png;base64,secret",
          },
        ],
      }),
    ).rejects.toThrow("Encoded image payload markers are forbidden");

    expect(existsSync(join(directory, "image-migration-manifest.json"))).toBe(
      false,
    );
  });

  test("commits the safe manifest only after completion and removes the journal", async () => {
    const { directory, state } = createState();
    await state.recordVerifiedAsset({
      entityId: "hero",
      oldContentHash: "legacy-hash",
      ref: REF,
      mediaType: "image/png",
      sizeBytes: 100,
    });

    await state.complete({
      migratedCount: 1,
      verifiedCount: 0,
      entries: [ENTRY],
    });

    const journalPath = join(directory, "image-prewrite-journal.json");
    const manifestPath = join(directory, "image-migration-manifest.json");
    expect(existsSync(journalPath)).toBe(false);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readFileSync(manifestPath, "utf8");
    expect(manifest).not.toContain("data:image/");
    expect(manifest).not.toContain("base64");
    expect(manifest).not.toContain("asset://");
    expect(JSON.parse(manifest)).toMatchObject({
      version: 1,
      entityType: "image",
      migratedCount: 1,
      verifiedCount: 0,
      entries: [ENTRY],
    });
  });
});
