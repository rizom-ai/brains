import { join } from "node:path";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { nowSeconds } from "@brains/utils/date";
import { JsonFileStore } from "./json-file-store";

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
  private readonly store: JsonFileStore<PasskeyStoreFile>;

  constructor(options: PasskeyStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(
        options.storageDir,
        options.storeFile ?? DEFAULT_PASSKEY_STORE_FILE,
      ),
      parse: parseStoreFile,
      empty: emptyStore,
      // An empty passkey store reads as "registration open" (hasCredentials
      // gates it), so a corrupt file must halt instead of starting empty.
      onCorrupt: "throw",
    });
  }

  async hasCredentials(): Promise<boolean> {
    const store = await this.store.read();
    return store.credentials.length > 0;
  }

  async listCredentials(): Promise<StoredPasskeyCredential[]> {
    const store = await this.store.read();
    return store.credentials;
  }

  async getCredential(
    id: string,
  ): Promise<StoredPasskeyCredential | undefined> {
    const store = await this.store.read();
    return store.credentials.find((credential) => credential.id === id);
  }

  async saveRegistrationChallenge(
    challenge: string,
    subject: string,
  ): Promise<void> {
    await this.store.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.store.read());
      const createdAt = nowSeconds();
      store.registrationChallenges.push({
        challenge,
        subject,
        created_at: createdAt,
        expires_at: createdAt + CHALLENGE_TTL_SECONDS,
      });
      await this.store.write(store);
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
    await this.store.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.store.read());
      const createdAt = nowSeconds();
      store.authenticationChallenges.push({
        challenge,
        subject,
        created_at: createdAt,
        expires_at: createdAt + CHALLENGE_TTL_SECONDS,
      });
      await this.store.write(store);
    });
  }

  async consumeAuthenticationChallenge(
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    return this.consumeChallenge("authenticationChallenges", challenge);
  }

  async addCredential(credential: StoredPasskeyCredential): Promise<void> {
    await this.store.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.store.read());
      if (store.credentials.some((existing) => existing.id === credential.id)) {
        throw new Error("Passkey credential already registered");
      }
      store.credentials.push(credential);
      await this.store.write(store);
    });
  }

  async rebindCredentialSubject(
    fromSubject: string,
    toSubject: string,
    userName: string,
  ): Promise<number> {
    let updated = 0;
    await this.store.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.store.read());
      for (const credential of store.credentials) {
        if (credential.subject === fromSubject) {
          credential.subject = toSubject;
          credential.user_name = userName;
          credential.updated_at = nowSeconds();
          updated += 1;
        }
      }
      if (updated > 0) {
        await this.store.write(store);
      }
    });
    return updated;
  }

  async updateCredentialCounter(id: string, counter: number): Promise<void> {
    await this.store.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.store.read());
      const credential = store.credentials.find((entry) => entry.id === id);
      if (!credential) {
        throw new Error("Passkey credential not found");
      }
      credential.counter = counter;
      credential.updated_at = nowSeconds();
      await this.store.write(store);
    });
  }

  private async consumeChallenge(
    type: "registrationChallenges" | "authenticationChallenges",
    challenge: string,
  ): Promise<StoredWebAuthnChallenge | undefined> {
    let consumed: StoredWebAuthnChallenge | undefined;
    await this.store.enqueueWrite(async () => {
      const store = withoutExpiredChallenges(await this.store.read());
      const index = store[type].findIndex(
        (entry) => entry.challenge === challenge,
      );
      if (index >= 0) {
        consumed = store[type][index];
        store[type].splice(index, 1);
      }
      await this.store.write(store);
    });
    return consumed;
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
