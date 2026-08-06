import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { getAssetDigest, type AssetRef } from "@brains/assets";
import { z } from "@brains/utils/zod";

export interface VerifiedAssetJournalEntryInput {
  entityId: string;
  oldContentHash: string;
  ref: AssetRef;
  mediaType: string;
  sizeBytes: number;
}

export interface BinaryAssetMigrationManifestEntry {
  entityId: string;
  oldContentHash: string;
  assetDigest: string;
  mediaType: string;
  sizeBytes: number;
  status: string;
  outcome: "migrated" | "verified";
}

export interface CompleteBinaryAssetMigrationInput {
  migratedCount: number;
  verifiedCount: number;
  entries: BinaryAssetMigrationManifestEntry[];
}

export interface FilesystemBinaryAssetMigrationStateOptions {
  stateDirectory: string;
  entityType: string;
}

const safeManifestTextSchema = z
  .string()
  .min(1)
  .refine((value) => !/data:image|;base64,/i.test(value), {
    message: "Encoded image payload markers are forbidden",
  });
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const journalEntrySchema = z.strictObject({
  entityId: safeManifestTextSchema,
  oldContentHash: safeManifestTextSchema,
  assetDigest: digestSchema,
  mediaType: safeManifestTextSchema,
  sizeBytes: z.number().int().nonnegative(),
  verifiedAt: z.string().datetime(),
});
const journalSchema = z.strictObject({
  version: z.literal(1),
  entityType: safeManifestTextSchema,
  entries: z.array(journalEntrySchema),
});
const manifestEntrySchema: z.ZodType<BinaryAssetMigrationManifestEntry> =
  z.strictObject({
    entityId: safeManifestTextSchema,
    oldContentHash: safeManifestTextSchema,
    assetDigest: digestSchema,
    mediaType: safeManifestTextSchema,
    sizeBytes: z.number().int().nonnegative(),
    status: safeManifestTextSchema,
    outcome: z.enum(["migrated", "verified"]),
  });
const manifestSchema = z.strictObject({
  version: z.literal(1),
  entityType: safeManifestTextSchema,
  completedAt: z.string().datetime(),
  migratedCount: z.number().int().nonnegative(),
  verifiedCount: z.number().int().nonnegative(),
  entries: z.array(manifestEntrySchema),
});

type Journal = z.infer<typeof journalSchema>;

export class FilesystemBinaryAssetMigrationState {
  private readonly stateDirectory: string;
  private readonly entityType: string;
  private readonly journalPath: string;
  private readonly manifestPath: string;

  constructor(options: FilesystemBinaryAssetMigrationStateOptions) {
    this.stateDirectory = options.stateDirectory;
    this.entityType = options.entityType;
    this.journalPath = join(
      this.stateDirectory,
      `${this.entityType}-prewrite-journal.json`,
    );
    this.manifestPath = join(
      this.stateDirectory,
      `${this.entityType}-migration-manifest.json`,
    );
  }

  async hasManifest(): Promise<boolean> {
    try {
      const content = await readFile(this.manifestPath, "utf8");
      const manifest = manifestSchema.parse(JSON.parse(content));
      if (manifest.entityType !== this.entityType) {
        throw new Error("Binary asset migration manifest entity type mismatch");
      }
      return true;
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw error;
    }
  }

  async canReuseVerifiedAsset(
    input: VerifiedAssetJournalEntryInput,
  ): Promise<boolean> {
    const journal = await this.readJournal();
    const digest = getAssetDigest(input.ref);
    return journal.entries.some(
      (entry) =>
        entry.entityId === input.entityId &&
        entry.oldContentHash === input.oldContentHash &&
        entry.assetDigest === digest &&
        entry.mediaType === input.mediaType &&
        entry.sizeBytes === input.sizeBytes,
    );
  }

  async recordVerifiedAsset(
    input: VerifiedAssetJournalEntryInput,
  ): Promise<void> {
    const journal = await this.readJournal();
    const assetDigest = getAssetDigest(input.ref);
    const entry = journalEntrySchema.parse({
      entityId: input.entityId,
      oldContentHash: input.oldContentHash,
      assetDigest,
      mediaType: input.mediaType,
      sizeBytes: input.sizeBytes,
      verifiedAt: new Date().toISOString(),
    });
    const entries = journal.entries.filter(
      (existing) => existing.assetDigest !== assetDigest,
    );
    entries.push(entry);
    await this.writeJson(this.journalPath, {
      version: 1,
      entityType: this.entityType,
      entries,
    });
  }

  async complete(input: CompleteBinaryAssetMigrationInput): Promise<void> {
    const manifest = manifestSchema.parse({
      version: 1,
      entityType: this.entityType,
      completedAt: new Date().toISOString(),
      migratedCount: input.migratedCount,
      verifiedCount: input.verifiedCount,
      entries: input.entries,
    });
    await this.writeJson(this.manifestPath, manifest);
    await rm(this.journalPath, { force: true });
    await syncDirectory(this.stateDirectory);
  }

  private async readJournal(): Promise<Journal> {
    try {
      const content = await readFile(this.journalPath, "utf8");
      const journal = journalSchema.parse(JSON.parse(content));
      if (journal.entityType !== this.entityType) {
        throw new Error("Binary asset migration journal entity type mismatch");
      }
      return journal;
    } catch (error) {
      if (isMissingFile(error)) {
        return { version: 1, entityType: this.entityType, entries: [] };
      }
      throw error;
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(
      this.stateDirectory,
      `.${this.entityType}-${process.pid}-${randomUUID()}.tmp`,
    );
    const file = await open(temporaryPath, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, path);
      await syncDirectory(this.stateDirectory);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
