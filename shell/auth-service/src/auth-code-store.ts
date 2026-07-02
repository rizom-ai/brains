import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { JsonFileStore } from "./json-file-store";
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

function isAuthorizationCodeRecord(
  value: unknown,
): value is AuthorizationCodeRecord {
  if (!value || typeof value !== "object") return false;
  const code = value as Record<string, unknown>;
  return (
    typeof code["code"] === "string" &&
    typeof code["client_id"] === "string" &&
    typeof code["redirect_uri"] === "string" &&
    typeof code["code_challenge"] === "string" &&
    code["code_challenge_method"] === "S256" &&
    typeof code["subject"] === "string" &&
    typeof code["created_at"] === "number" &&
    typeof code["expires_at"] === "number"
  );
}

function parseStoreFile(value: unknown): AuthCodeStoreFile {
  if (!value || typeof value !== "object") {
    return { codes: [] };
  }

  const codes = (value as { codes?: unknown }).codes;
  if (!Array.isArray(codes)) {
    return { codes: [] };
  }

  return {
    codes: codes.filter(isAuthorizationCodeRecord),
  };
}

async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

export class AuthorizationCodeStore {
  private readonly store: JsonFileStore<AuthCodeStoreFile>;

  constructor(options: AuthorizationCodeStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(
        options.storageDir,
        options.storeFile ?? DEFAULT_AUTH_CODE_STORE_FILE,
      ),
      parse: parseStoreFile,
      empty: (): AuthCodeStoreFile => ({ codes: [] }),
    });
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

    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
      store.codes = store.codes.filter((code) => code.expires_at > issuedAt);
      store.codes.push(record);
      await this.store.write(store);
    });

    return record;
  }

  async consumeCode(
    input: ConsumeAuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord> {
    const now = nowSeconds();
    let consumed: AuthorizationCodeRecord | undefined;

    await this.store.enqueueWrite(async () => {
      const store = await this.store.read();
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
      await this.store.write(store);
    });

    if (!consumed) {
      throw new InvalidGrantError("Authorization code not consumed");
    }
    return consumed;
  }
}

export class InvalidGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGrantError";
  }
}
