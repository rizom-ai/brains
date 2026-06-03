import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "@brains/utils";

export const webChatUploadRefKind = "web-chat-upload";
export const webChatUploadIdPattern =
  /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const defaultWebChatUploadRetentionMs = 24 * 60 * 60 * 1000;
export const defaultWebChatUploadMaxCount = 200;

export interface WebChatUploadRecord {
  id: string;
  ref: { kind: typeof webChatUploadRefKind; id: string };
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface WebChatUploadResponseBody extends WebChatUploadRecord {
  url: string;
  downloadUrl: string;
}

export interface WebChatUploadStoreOptions {
  dataDir: string;
  retentionMs?: number | undefined;
  maxCount?: number | undefined;
  createId?: (() => string) | undefined;
  now?: (() => Date) | undefined;
}

export interface SaveWebChatUploadInput {
  filename: string;
  mediaType: string;
  content: Buffer;
}

export interface ResolvedWebChatUpload {
  record: WebChatUploadRecord;
  content: Buffer;
}

export type WebChatUploadStoreErrorCode =
  | "invalid_ref"
  | "not_found"
  | "invalid_metadata";

export class WebChatUploadStoreError extends Error {
  constructor(
    public readonly code: WebChatUploadStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WebChatUploadStoreError";
  }
}

const uploadRefSchema = z.object({
  kind: z.literal(webChatUploadRefKind),
  id: z.string().regex(webChatUploadIdPattern),
});

const webChatUploadRecordSchema: z.ZodType<WebChatUploadRecord> = z.object({
  id: z.string().regex(webChatUploadIdPattern),
  ref: uploadRefSchema,
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});

export class WebChatUploadStore {
  private readonly retentionMs: number;
  private readonly maxCount: number;
  private readonly createUploadId: () => string;
  private readonly getNow: () => Date;

  constructor(private readonly options: WebChatUploadStoreOptions) {
    this.retentionMs = options.retentionMs ?? defaultWebChatUploadRetentionMs;
    this.maxCount = options.maxCount ?? defaultWebChatUploadMaxCount;
    this.createUploadId =
      options.createId ?? ((): string => `upload-${crypto.randomUUID()}`);
    this.getNow = options.now ?? ((): Date => new Date());
  }

  async save(input: SaveWebChatUploadInput): Promise<WebChatUploadRecord> {
    const uploadId = this.createUploadId();
    this.assertValidUploadId(uploadId);

    const record: WebChatUploadRecord = {
      id: uploadId,
      ref: { kind: webChatUploadRefKind, id: uploadId },
      filename: input.filename,
      mediaType: input.mediaType,
      sizeBytes: input.content.byteLength,
      createdAt: this.getNow().toISOString(),
    };

    const uploadDir = this.getUploadDir(uploadId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "content"), input.content);
    await writeFile(
      join(uploadDir, "metadata.json"),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
    await this.prune();

    return record;
  }

  async read(uploadId: string): Promise<ResolvedWebChatUpload> {
    const record = await this.readRecord(uploadId);
    try {
      const content = await readFile(
        join(this.getUploadDir(uploadId), "content"),
      );
      return { record, content };
    } catch {
      throw new WebChatUploadStoreError("not_found", "Upload not found");
    }
  }

  async readRecord(uploadId: string): Promise<WebChatUploadRecord> {
    this.assertValidUploadId(uploadId);

    try {
      const raw = await readFile(
        join(this.getUploadDir(uploadId), "metadata.json"),
        "utf8",
      );
      const parsed = webChatUploadRecordSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.id !== uploadId) {
        throw new WebChatUploadStoreError(
          "invalid_metadata",
          "Invalid upload metadata",
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof WebChatUploadStoreError) throw error;
      throw new WebChatUploadStoreError("not_found", "Upload not found");
    }
  }

  toResponseBody(record: WebChatUploadRecord): WebChatUploadResponseBody {
    return {
      ...record,
      url: this.getUploadUrl(record.id),
      downloadUrl: this.getUploadUrl(record.id, true),
    };
  }

  async prune(): Promise<void> {
    const root = this.getUploadsRoot();
    try {
      const entries = await readdir(root);
      const stats = await Promise.all(
        entries.map(async (entry) => {
          try {
            const info = await stat(join(root, entry));
            return info.isDirectory() ? { entry, mtimeMs: info.mtimeMs } : null;
          } catch {
            return null;
          }
        }),
      );
      const dirs = stats
        .filter(
          (value): value is { entry: string; mtimeMs: number } =>
            value !== null,
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
    } catch {
      /* uploads dir missing or unreadable — nothing to prune */
    }
  }

  getUploadDir(uploadId: string): string {
    this.assertValidUploadId(uploadId);
    return join(this.getUploadsRoot(), uploadId);
  }

  private getUploadsRoot(): string {
    return join(this.options.dataDir, "web-chat", "uploads");
  }

  private getUploadUrl(uploadId: string, download = false): string {
    this.assertValidUploadId(uploadId);
    const encodedId = encodeURIComponent(uploadId);
    return `/api/chat/uploads?id=${encodedId}${download ? "&download=1" : ""}`;
  }

  private assertValidUploadId(uploadId: string): void {
    if (!webChatUploadIdPattern.test(uploadId)) {
      throw new WebChatUploadStoreError("invalid_ref", "Invalid upload ref");
    }
  }
}
