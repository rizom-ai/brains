import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DEFAULT_DEDUPE_FILE = "operator-notifications/dedupe.json";

interface DedupeRecord {
  keyHash: string;
  sentAt: number;
  deliveryId?: string;
}

interface DedupeStoreFile {
  delivered: DedupeRecord[];
}

export interface DedupeStoreOptions {
  storageDir: string;
  storeFile?: string;
}

export interface MarkDeliveredOptions {
  deliveryId?: string;
}

function hashDedupeKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function isDedupeRecord(value: unknown): value is DedupeRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["keyHash"] === "string" &&
    typeof record["sentAt"] === "number" &&
    (record["deliveryId"] === undefined ||
      typeof record["deliveryId"] === "string")
  );
}

function parseStoreFile(value: unknown): DedupeStoreFile {
  if (!value || typeof value !== "object") return { delivered: [] };

  const delivered = (value as { delivered?: unknown }).delivered;
  if (Array.isArray(delivered)) {
    return { delivered: delivered.filter(isDedupeRecord) };
  }

  return { delivered: [] };
}

export class DedupeStore {
  private readonly storeFile: string;
  private loaded: Map<string, DedupeRecord> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: DedupeStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_DEDUPE_FILE,
    );
  }

  async has(key: string): Promise<boolean> {
    const records = await this.ensureLoaded();
    return records.has(hashDedupeKey(key));
  }

  async markDelivered(
    key: string,
    options: MarkDeliveredOptions = {},
  ): Promise<void> {
    const records = await this.ensureLoaded();
    const keyHash = hashDedupeKey(key);
    if (records.has(keyHash)) return;

    const record: DedupeRecord = {
      keyHash,
      sentAt: Math.floor(Date.now() / 1000),
      ...(options.deliveryId ? { deliveryId: options.deliveryId } : {}),
    };
    records.set(keyHash, record);
    await this.enqueueWrite(() =>
      this.writeStore({ delivered: [...records.values()] }),
    );
  }

  private async ensureLoaded(): Promise<Map<string, DedupeRecord>> {
    if (this.loaded) return this.loaded;
    try {
      const parsed = parseStoreFile(
        JSON.parse(await readFile(this.storeFile, "utf8")) as unknown,
      );
      this.loaded = new Map(
        parsed.delivered.map((record) => [record.keyHash, record]),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.loaded = new Map();
    }
    return this.loaded;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async writeStore(store: DedupeStoreFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
  }
}
