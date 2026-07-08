import { join } from "node:path";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { JsonFileStore } from "./json-file-store";
import { nowSeconds } from "@brains/utils/date";
import { z } from "@brains/utils/zod";

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

const authenticatorTransportSchema = z.custom<AuthenticatorTransportFuture>(
  (value) => typeof value === "string",
);

const credentialSchema = z
  .looseObject({
    id: z.string(),
    public_key: z.string(),
    counter: z.number(),
    transports: z.array(authenticatorTransportSchema).optional(),
    subject: z.string(),
    user_name: z.string(),
    credential_device_type: z.string().optional(),
    credential_backed_up: z.boolean().optional(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((credential): StoredPasskeyCredential => ({
    id: credential.id,
    public_key: credential.public_key,
    counter: credential.counter,
    ...(credential.transports !== undefined
      ? { transports: credential.transports }
      : {}),
    subject: credential.subject,
    user_name: credential.user_name,
    credential_device_type: credential.credential_device_type ?? "unknown",
    credential_backed_up: credential.credential_backed_up ?? false,
    created_at: credential.created_at,
    updated_at: credential.updated_at,
  }));

const challengeSchema = z.looseObject({
  challenge: z.string(),
  subject: z.string(),
  created_at: z.number(),
  expires_at: z.number(),
});

const passkeyStoreFileSchema = z.looseObject({
  credentials: z.array(z.unknown()).optional(),
  registrationChallenges: z.array(z.unknown()).optional(),
  authenticationChallenges: z.array(z.unknown()).optional(),
});

function parseStoreFile(value: unknown): PasskeyStoreFile {
  const parsed = passkeyStoreFileSchema.safeParse(value);
  if (!parsed.success) return emptyStore();

  return {
    credentials: parsed.data.credentials?.flatMap(parseCredential) ?? [],
    registrationChallenges:
      parsed.data.registrationChallenges?.flatMap(parseChallenge) ?? [],
    authenticationChallenges:
      parsed.data.authenticationChallenges?.flatMap(parseChallenge) ?? [],
  };
}

function parseCredential(value: unknown): StoredPasskeyCredential[] {
  const parsed = credentialSchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

function parseChallenge(value: unknown): StoredWebAuthnChallenge[] {
  const parsed = challengeSchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
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
