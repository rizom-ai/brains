import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";

export const runtimeUploadIdPattern: RegExp =
  /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const defaultRuntimeUploadRetentionMs: number = 24 * 60 * 60 * 1000;
export const defaultRuntimeUploadMaxCount: number = 200;

export interface RuntimeUploadRef {
  kind: string;
  id: string;
}

export interface RuntimeUploadRecord {
  id: string;
  ref: RuntimeUploadRef;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface RuntimeUploadResponseBody extends RuntimeUploadRecord {
  url: string;
  downloadUrl: string;
}

/** True for "no such file or directory" — the only benign read failure here. */
function isNoEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export interface RuntimeUploadScopeOptions {
  /** Filesystem namespace below the runtime data directory, e.g. "upload". */
  namespace: string;
  /** Ref discriminator exposed to clients, e.g. "upload". */
  refKind: string;
  /** HTTP route used to resolve stored uploads, e.g. "/api/chat/uploads". */
  routePath: string;
  retentionMs?: number | undefined;
  maxCount?: number | undefined;
  createId?: (() => string) | undefined;
  now?: (() => Date) | undefined;
}

export interface RuntimeUploadRegistryOptions {
  dataDir: string;
  /** Reports pruning faults, which must not fail a save but must be seen. */
  logger?: Logger | undefined;
}

export interface SaveRuntimeUploadInput {
  filename: string;
  mediaType: string;
  content: Buffer;
  metadata?: Record<string, unknown> | undefined;
}

export interface ResolvedRuntimeUpload {
  record: RuntimeUploadRecord;
  content: Buffer;
}

export type RuntimeUploadStoreErrorCode =
  "invalid_ref" | "not_found" | "invalid_metadata";

export class RuntimeUploadStoreError extends Error {
  public readonly code: RuntimeUploadStoreErrorCode;
  constructor(code: RuntimeUploadStoreErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RuntimeUploadStoreError";
  }
}

const runtimeUploadRecordSchema = z.object({
  id: z.string().regex(runtimeUploadIdPattern),
  ref: z.object({
    kind: z.string().min(1),
    id: z.string().regex(runtimeUploadIdPattern),
  }),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * The store surface consumers get, rather than the class that implements it.
 *
 * Declaring the class here made every consumer depend on its private fields
 * too, so nothing could stand in for a scoped store without asserting it was
 * one. The class satisfies this by construction.
 */
export type ScopedRuntimeUploadStore = Pick<
  RuntimeUploadStore,
  | "save"
  | "read"
  | "readRecord"
  | "toResponseBody"
  | "prune"
  | "getUploadDir"
  | "remove"
>;

export interface IRuntimeUploadsNamespace {
  /** Create a scoped runtime upload store for an interface/plugin namespace. */
  scoped(options: RuntimeUploadScopeOptions): ScopedRuntimeUploadStore;
}

export function createRuntimeUploadsNamespace(
  registry: RuntimeUploadRegistry,
): IRuntimeUploadsNamespace {
  return {
    scoped: (options: RuntimeUploadScopeOptions): RuntimeUploadStore =>
      registry.scoped(options),
  };
}

export function normalizeRuntimeUploadDataDir(contentDataDir: string): string {
  return basename(contentDataDir) === "brain-data"
    ? join(dirname(contentDataDir), "data")
    : contentDataDir;
}

export class RuntimeUploadRegistry {
  private readonly dataDir: string;
  private readonly logger: Logger | undefined;

  constructor(options: RuntimeUploadRegistryOptions) {
    this.dataDir = normalizeRuntimeUploadDataDir(options.dataDir);
    this.logger = options.logger;
  }

  static createFresh(
    options: RuntimeUploadRegistryOptions,
  ): RuntimeUploadRegistry {
    return new RuntimeUploadRegistry(options);
  }

  scoped(options: RuntimeUploadScopeOptions): RuntimeUploadStore {
    return new RuntimeUploadStore({
      ...options,
      dataDir: this.dataDir,
      ...(this.logger !== undefined && { logger: this.logger }),
    });
  }
}

export interface RuntimeUploadStoreOptions extends RuntimeUploadScopeOptions {
  dataDir: string;
  logger?: Logger | undefined;
}

export class RuntimeUploadStore {
  private readonly options: RuntimeUploadStoreOptions;
  private readonly retentionMs: number;
  private readonly maxCount: number;
  private readonly createUploadId: () => string;
  private readonly getNow: () => Date;
  private readonly logger: Logger | undefined;

  constructor(options: RuntimeUploadStoreOptions) {
    this.options = options;
    this.logger = options.logger;
    this.retentionMs = options.retentionMs ?? defaultRuntimeUploadRetentionMs;
    this.maxCount = options.maxCount ?? defaultRuntimeUploadMaxCount;
    this.createUploadId =
      options.createId ?? ((): string => `upload-${crypto.randomUUID()}`);
    this.getNow = options.now ?? ((): Date => new Date());
  }

  async save(input: SaveRuntimeUploadInput): Promise<RuntimeUploadRecord> {
    const uploadId = this.createUploadId();
    this.assertValidUploadId(uploadId);

    const record: RuntimeUploadRecord = {
      id: uploadId,
      ref: { kind: this.options.refKind, id: uploadId },
      filename: input.filename,
      mediaType: input.mediaType,
      sizeBytes: input.content.byteLength,
      createdAt: this.getNow().toISOString(),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    };

    const uploadDir = this.getUploadDir(uploadId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "content"), input.content);
    await writeFile(
      join(uploadDir, "metadata.json"),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
    // The upload is already on disk, so a pruning fault must not fail the
    // save. It must not vanish either: unpruned uploads grow without bound.
    await this.prune().catch((error: unknown) => {
      this.logger?.warn("Failed to prune runtime uploads", {
        error: getErrorMessage(error),
      });
    });

    return record;
  }

  async remove(uploadId: string): Promise<void> {
    this.assertValidUploadId(uploadId);
    await rm(this.getUploadDir(uploadId), { recursive: true, force: true });
  }

  async read(uploadId: string): Promise<ResolvedRuntimeUpload> {
    const record = await this.readRecord(uploadId);
    try {
      const content = await readFile(
        join(this.getUploadDir(uploadId), "content"),
      );
      return { record, content };
    } catch {
      throw new RuntimeUploadStoreError("not_found", "Upload not found");
    }
  }

  async readRecord(uploadId: string): Promise<RuntimeUploadRecord> {
    this.assertValidUploadId(uploadId);

    try {
      const raw = await readFile(
        join(this.getUploadDir(uploadId), "metadata.json"),
        "utf8",
      );
      const parsed = runtimeUploadRecordSchema.safeParse(JSON.parse(raw));
      if (
        !parsed.success ||
        parsed.data.id !== uploadId ||
        parsed.data.ref.id !== uploadId ||
        parsed.data.ref.kind !== this.options.refKind
      ) {
        throw new RuntimeUploadStoreError(
          "invalid_metadata",
          "Invalid upload metadata",
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof RuntimeUploadStoreError) throw error;
      throw new RuntimeUploadStoreError("not_found", "Upload not found");
    }
  }

  toResponseBody(record: RuntimeUploadRecord): RuntimeUploadResponseBody {
    return {
      ...record,
      url: this.getUploadUrl(record.id),
      downloadUrl: this.getUploadUrl(record.id, true),
    };
  }

  /**
   * Drop uploads past the retention window or the count cap.
   *
   * Returns quietly only when the uploads directory does not exist yet — it is
   * created on first save. Every other failure raises: an unreadable directory
   * or a deletion that did not happen means uploads accumulate unbounded, and
   * a silent catch here made that indistinguishable from a successful prune.
   */
  async prune(): Promise<void> {
    const root = this.getUploadsRoot();

    let entries: string[];
    try {
      entries = await readdir(root);
    } catch (error) {
      if (isNoEntryError(error)) return;
      throw error;
    }

    const stats = await Promise.all(
      entries.map(async (entry) => {
        try {
          const info = await stat(join(root, entry));
          return info.isDirectory() ? { entry, mtimeMs: info.mtimeMs } : null;
        } catch (error) {
          // An upload directory can be removed between listing and stat.
          if (isNoEntryError(error)) return null;
          throw error;
        }
      }),
    );
    const dirs = stats
      .filter(
        (value): value is { entry: string; mtimeMs: number } => value !== null,
      )
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const cutoff = this.getNow().getTime() - this.retentionMs;
    const stale = dirs.filter(
      (dir, index) => index >= this.maxCount || dir.mtimeMs < cutoff,
    );
    await Promise.all(
      stale.map((dir) =>
        rm(join(root, dir.entry), { recursive: true, force: true }),
      ),
    );
  }

  getUploadDir(uploadId: string): string {
    this.assertValidUploadId(uploadId);
    return join(this.getUploadsRoot(), uploadId);
  }

  private getUploadsRoot(): string {
    return join(this.options.dataDir, this.options.namespace, "uploads");
  }

  private getUploadUrl(uploadId: string, download = false): string {
    this.assertValidUploadId(uploadId);
    const encodedId = encodeURIComponent(uploadId);
    return `${this.options.routePath}?id=${encodedId}${download ? "&download=1" : ""}`;
  }

  private assertValidUploadId(uploadId: string): void {
    if (!runtimeUploadIdPattern.test(uploadId)) {
      throw new RuntimeUploadStoreError("invalid_ref", "Invalid upload ref");
    }
  }
}
