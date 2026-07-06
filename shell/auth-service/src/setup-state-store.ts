import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";
import { isFileNotFoundError } from "./fs-errors";

const DEFAULT_SETUP_STATE_FILE = "oauth-setup-state.json";

export interface StoredSetupToken {
  token: string;
  expiresAt: number;
}

interface StoredSetupDelivery {
  setupTokenId: string;
  recipientHash: string;
  deliveredAt: number;
  deliveryId?: string;
}

interface SetupStateFile {
  setupToken?: StoredSetupToken;
  deliveries: StoredSetupDelivery[];
}

export interface SetupStateStoreOptions {
  storageDir: string;
  storeFile?: string;
}

export interface RecordSetupDeliveryOptions {
  deliveryId?: string;
}

export function setupTokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function recipientHash(recipient: string): string {
  return createHash("sha256")
    .update(recipient.trim().toLowerCase())
    .digest("hex");
}

const storedSetupTokenSchema = z.looseObject({
  token: z.string(),
  expiresAt: z.number(),
});

const storedSetupDeliverySchema = z
  .looseObject({
    setupTokenId: z.string(),
    recipientHash: z.string(),
    deliveredAt: z.number(),
    deliveryId: z.string().optional(),
  })
  .transform((delivery): StoredSetupDelivery => ({
    setupTokenId: delivery.setupTokenId,
    recipientHash: delivery.recipientHash,
    deliveredAt: delivery.deliveredAt,
    ...(delivery.deliveryId !== undefined
      ? { deliveryId: delivery.deliveryId }
      : {}),
  }));

const setupStateFileSchema = z.looseObject({
  setupToken: z.unknown().optional(),
  deliveries: z.array(z.unknown()).optional(),
});

function emptyState(): SetupStateFile {
  return { deliveries: [] };
}

function parseStoreFile(value: unknown): SetupStateFile {
  const parsed = setupStateFileSchema.safeParse(value);
  if (!parsed.success) return emptyState();

  const setupToken = storedSetupTokenSchema.safeParse(parsed.data.setupToken);
  return {
    ...(setupToken.success ? { setupToken: setupToken.data } : {}),
    deliveries: parsed.data.deliveries?.flatMap(parseStoredSetupDelivery) ?? [],
  };
}

function parseStoredSetupDelivery(value: unknown): StoredSetupDelivery[] {
  const parsed = storedSetupDeliverySchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

export class SetupStateStore {
  private readonly storeFile: string;
  private loaded: SetupStateFile | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: SetupStateStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_SETUP_STATE_FILE,
    );
  }

  async getValidSetupToken(
    nowSeconds: number,
  ): Promise<StoredSetupToken | undefined> {
    const state = await this.ensureLoaded();
    if (!state.setupToken) return undefined;
    if (state.setupToken.expiresAt <= nowSeconds) {
      delete state.setupToken;
      state.deliveries = [];
      await this.enqueueWrite(() => this.writeStore(state));
      return undefined;
    }
    return state.setupToken;
  }

  async saveSetupToken(setupToken: StoredSetupToken): Promise<void> {
    const state = await this.ensureLoaded();
    const activeSetupTokenId = setupTokenId(setupToken.token);
    state.setupToken = setupToken;
    state.deliveries = state.deliveries.filter(
      (delivery) => delivery.setupTokenId === activeSetupTokenId,
    );
    await this.enqueueWrite(() => this.writeStore(state));
  }

  async clearSetupState(): Promise<void> {
    this.loaded = emptyState();
    await this.enqueueWrite(() => this.writeStore(this.loaded ?? emptyState()));
  }

  async hasDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    const state = await this.ensureLoaded();
    const recipientHashValue = recipientHash(recipient);
    return state.deliveries.some(
      (delivery) =>
        delivery.setupTokenId === setupTokenIdValue &&
        delivery.recipientHash === recipientHashValue,
    );
  }

  async recordDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: RecordSetupDeliveryOptions = {},
  ): Promise<void> {
    const state = await this.ensureLoaded();
    if (await this.hasDelivery(setupTokenIdValue, recipient)) return;

    const delivery: StoredSetupDelivery = {
      setupTokenId: setupTokenIdValue,
      recipientHash: recipientHash(recipient),
      deliveredAt: Math.floor(Date.now() / 1000),
      ...(options.deliveryId ? { deliveryId: options.deliveryId } : {}),
    };
    state.deliveries.push(delivery);
    await this.enqueueWrite(() => this.writeStore(state));
  }

  private async ensureLoaded(): Promise<SetupStateFile> {
    if (this.loaded) return this.loaded;
    try {
      this.loaded = parseStoreFile(
        JSON.parse(await readFile(this.storeFile, "utf8")),
      );
    } catch (error) {
      if (!isFileNotFoundError(error)) throw error;
      this.loaded = emptyState();
    }
    return this.loaded;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async writeStore(store: SetupStateFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
  }
}
