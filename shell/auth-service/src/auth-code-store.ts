import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";
import { isFileNotFoundError } from "./fs-errors";
import { redirectUriMatches } from "./redirect-uri";

const DEFAULT_AUTH_CODE_STORE_FILE = "oauth-auth-codes.json";
const AUTH_CODE_TTL_SECONDS = 10 * 60;

export interface AuthorizationCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope?: string;
  subject: string;
  created_at: number;
  expires_at: number;
  consumed_at?: number;
}

interface AuthCodeStoreFile {
  codes: AuthorizationCodeRecord[];
}

export interface CreateAuthorizationCodeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
  subject: string;
}

export interface ConsumeAuthorizationCodeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface AuthorizationCodeStoreOptions {
  storageDir: string;
  storeFile?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const authorizationCodeRecordSchema = z
  .looseObject({
    code: z.string(),
    client_id: z.string(),
    redirect_uri: z.string(),
    code_challenge: z.string(),
    code_challenge_method: z.literal("S256"),
    scope: z.string().optional(),
    subject: z.string(),
    created_at: z.number(),
    expires_at: z.number(),
    consumed_at: z.number().optional(),
  })
  .transform((code): AuthorizationCodeRecord => ({
    code: code.code,
    client_id: code.client_id,
    redirect_uri: code.redirect_uri,
    code_challenge: code.code_challenge,
    code_challenge_method: code.code_challenge_method,
    ...(code.scope !== undefined ? { scope: code.scope } : {}),
    subject: code.subject,
    created_at: code.created_at,
    expires_at: code.expires_at,
    ...(code.consumed_at !== undefined
      ? { consumed_at: code.consumed_at }
      : {}),
  }));

const authCodeStoreFileSchema = z.looseObject({
  codes: z.array(z.unknown()).optional(),
});

function parseStoreFile(value: unknown): AuthCodeStoreFile {
  const parsed = authCodeStoreFileSchema.safeParse(value);
  if (!parsed.success) return { codes: [] };

  return {
    codes: parsed.data.codes?.flatMap(parseAuthorizationCode) ?? [],
  };
}

function parseAuthorizationCode(value: unknown): AuthorizationCodeRecord[] {
  const parsed = authorizationCodeRecordSchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

export class AuthorizationCodeStore {
  private readonly storeFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: AuthorizationCodeStoreOptions) {
    this.storeFile = join(
      options.storageDir,
      options.storeFile ?? DEFAULT_AUTH_CODE_STORE_FILE,
    );
  }

  async createCode(
    input: CreateAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord> {
    const issuedAt = nowSeconds();
    const record: AuthorizationCodeRecord = {
      code: `ocd_${randomUUID()}`,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      ...(input.scope ? { scope: input.scope } : {}),
      subject: input.subject,
      created_at: issuedAt,
      expires_at: issuedAt + AUTH_CODE_TTL_SECONDS,
    };

    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      store.codes = store.codes.filter((code) => code.expires_at > issuedAt);
      store.codes.push(record);
      await this.writeStore(store);
    });

    return record;
  }

  async consumeCode(
    input: ConsumeAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord> {
    const now = nowSeconds();
    let consumed: AuthorizationCodeRecord | undefined;

    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      const index = store.codes.findIndex(
        (record) => record.code === input.code,
      );
      const record = index >= 0 ? store.codes[index] : undefined;

      if (!record) {
        throw new InvalidGrantError("Authorization code not found");
      }
      if (record.consumed_at !== undefined) {
        throw new InvalidGrantError("Authorization code already consumed");
      }
      if (record.expires_at <= now) {
        throw new InvalidGrantError("Authorization code expired");
      }
      if (record.client_id !== input.clientId) {
        throw new InvalidGrantError("Authorization code client mismatch");
      }
      if (!redirectUriMatches(record.redirect_uri, input.redirectUri)) {
        throw new InvalidGrantError("Authorization code redirect URI mismatch");
      }

      const expectedChallenge = await pkceS256(input.codeVerifier);
      if (record.code_challenge !== expectedChallenge) {
        throw new InvalidGrantError("PKCE verification failed");
      }

      consumed = { ...record, consumed_at: now };
      store.codes[index] = consumed;
      await this.writeStore(store);
    });

    if (!consumed) {
      throw new InvalidGrantError("Authorization code not consumed");
    }
    return consumed;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private async readStore(): Promise<AuthCodeStoreFile> {
    try {
      return parseStoreFile(JSON.parse(await readFile(this.storeFile, "utf8")));
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return { codes: [] };
      }
      throw error;
    }
  }

  private async writeStore(store: AuthCodeStoreFile): Promise<void> {
    await mkdir(dirname(this.storeFile), { recursive: true, mode: 0o700 });
    await writeFile(this.storeFile, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.storeFile, 0o600);
  }
}

export class InvalidGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGrantError";
  }
}
