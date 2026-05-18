import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

function isStoredSetupToken(value: unknown): value is StoredSetupToken {
  if (!value || typeof value !== "object") return false;
  const token = value as Record<string, unknown>;
  return (
    typeof token["token"] === "string" && typeof token["expiresAt"] === "number"
  );
}

function isStoredSetupDelivery(value: unknown): value is StoredSetupDelivery {
  if (!value || typeof value !== "object") return false;
  const delivery = value as Record<string, unknown>;
  return (
    typeof delivery["setupTokenId"] === "string" &&
    typeof delivery["recipientHash"] === "string" &&
    typeof delivery["deliveredAt"] === "number" &&
    (delivery["deliveryId"] === undefined ||
      typeof delivery["deliveryId"] === "string")
  );
}

function emptyState(): SetupStateFile {
  return { deliveries: [] };
}

function parseStoreFile(value: unknown): SetupStateFile {
  if (!value || typeof value !== "object") return emptyState();

  const file = value as Record<string, unknown>;
  return {
    ...(isStoredSetupToken(file["setupToken"])
      ? { setupToken: file["setupToken"] }
      : {}),
    deliveries: Array.isArray(file["deliveries"])
      ? file["deliveries"].filter(isStoredSetupDelivery)
      : [],
  };
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
        JSON.parse(await readFile(this.storeFile, "utf8")) as unknown,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
