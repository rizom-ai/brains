import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

const DEFAULT_PASSKEY_STORE_FILE = "oauth-passkeys.json";
const CHALLENGE_TTL_SECONDS = 10 * 60;

export interface StoredPasskeyCredential {
  id: string;
  public_key: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  subject: string;
  user_name: string;
  credential_device_type: string;
  credential_backed_up: boolean;
  created_at: number;
  updated_at: number;
}

export interface StoredWebAuthnChallenge {
  challenge: string;
  subject: string;
  created_at: number;
  expires_at: number;
}

interface PasskeyStoreFile {
  credentials: StoredPasskeyCredential[];
  registrationChallenges: StoredWebAuthnChallenge[];
  authenticationChallenges: StoredWebAuthnChallenge[];
}

export interface PasskeyStoreOptions {
  storageDir: string;
  storeFile?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isCredential(value: unknown): value is StoredPasskeyCredential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Record<string, unknown>;
  return (
    typeof credential["id"] === "string" &&
    typeof credential["public_key"] === "string" &&
    typeof credential["counter"] === "number" &&
    typeof credential["subject"] === "string" &&
    typeof credential["user_name"] === "string" &&
    typeof credential["created_at"] === "number" &&
    typeof credential["updated_at"] === "number"
  );
}

function isChallenge(value: unknown): value is StoredWebAuthnChallenge {
  if (!value || typeof value !== "object") return false;
  const challenge = value as Record<string, unknown>;
  return (
    typeof challenge["challenge"] === "string" &&
    typeof challenge["subject"] === "string" &&
    typeof challenge["created_at"] === "number" &&
    typeof challenge["expires_at"] === "number"
  );
}

function parseStoreFile(value: unknown): PasskeyStoreFile {
  if (!value || typeof value !== "object") {
    return emptyStore();
  }
  const file = value as Partial<Record<keyof PasskeyStoreFile, unknown>>;
  return {
    credentials: Array.isArray(file.credentials)
      ? file.credentials.filter(isCredential)
      : [],
    registrationChallenges: Array.isArray(file.registrationChallenges)
      ? file.registrationChallenges.filter(isChallenge)
      : [],
    authenticationChallenges: Array.isArray(file.authenticationChallenges)
      ? file.authenticationChallenges.filter(isChallenge)
      : [],
  };
}

function emptyStore(): PasskeyStoreFile {
  return {
    credentials: [],
    registrationChallenges: [],
    authenticationChallenges: [],
  };
}

function withoutExpiredChallenges(store: PasskeyStoreFile): PasskeyStoreFile {
  const now = nowSeconds();
  return {
    ...store,
    registrationChallenges: store.registrationChallenges.filter(
      (challenge) => challenge.expires_at > now,
    ),
    authenticationChallenges: store.authenticationChallenges.filter(
      (challenge) => challenge.expires_at > now,
    ),
  };
}

export class PasskeyStore {
  private readonly storeFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: PasskeyStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_PASSKEY_STORE_FILE,
    );
  }

  async hasCredentials(): Promise<boolean> {
    const store = await this.readStore();
    return store.credentials.length > 0;
  }

  async listCredentials(): Promise<StoredPasskeyCredential[]> {
    const store = await this.readStore();
    return store.credentials;
  }

  async getCredential(
    id: string,
  ): Promise<StoredPasskeyCredential | undefined> {
    const store = await this.readStore();
    return store.credentials.find((credential) => credential.id === id);
  }

  async saveRegistrationChallenge(
    challenge: string,
    subject: string,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.readStore());
      const createdAt = nowSeconds();
      store.registrationChallenges.push({
        challenge,
        subject,
        created_at: createdAt,
        expires_at: createdAt + CHALLENGE_TTL_SECONDS,
      });
      await this.writeStore(store);
    });
  }

  async consumeRegistrationChallenge(
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    return this.consumeChallenge("registrationChallenges", challenge);
  }

  async saveAuthenticationChallenge(
    challenge: string,
    subject: string,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.readStore());
      const createdAt = nowSeconds();
      store.authenticationChallenges.push({
        challenge,
        subject,
        created_at: createdAt,
        expires_at: createdAt + CHALLENGE_TTL_SECONDS,
      });
      await this.writeStore(store);
    });
  }

  async consumeAuthenticationChallenge(
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    return this.consumeChallenge("authenticationChallenges", challenge);
  }

  async addCredential(credential: StoredPasskeyCredential): Promise<void> {
    await this.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.readStore());
      if (store.credentials.some((existing) => existing.id === credential.id)) {
        throw new Error("Passkey credential already registered");
      }
      store.credentials.push(credential);
      await this.writeStore(store);
    });
  }

  async updateCredentialCounter(id: string, counter: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.readStore());
      const credential = store.credentials.find((entry) => entry.id === id);
      if (!credential) {
        throw new Error("Passkey credential not found");
      }
      credential.counter = counter;
      credential.updated_at = nowSeconds();
      await this.writeStore(store);
    });
  }

  private async consumeChallenge(
    type: "registrationChallenges" | "authenticationChallenges",
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    let consumed: StoredWebAuthnChallenge | undefined;
    await this.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.readStore());
      const index = store[type].findIndex(
        (entry) => entry.challenge === challenge,
      );
      if (index >= 0) {
        consumed = store[type][index];
        store[type].splice(index, 1);
      }
      await this.writeStore(store);
    });
    return consumed;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async readStore(): Promise<PasskeyStoreFile> {
    try {
      return parseStoreFile(
        JSON.parse(await readFile(this.storeFile, "utf8")) as unknown,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyStore();
      }
      throw error;
    }
  }

  private async writeStore(store: PasskeyStoreFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
  }
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(value, "base64url");
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new Uint8Array(arrayBuffer);
}
