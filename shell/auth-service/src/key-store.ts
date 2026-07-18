import { generateKeyPairSync } from "node:crypto";
import { sha256Base64Url } from "@brains/utils/hash";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";
import { and, eq } from "drizzle-orm";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { oauthSigningKeys } from "./runtime-schema";
import type {
  A2APrivateJwk,
  A2APublicJwk,
  OAuthPrivateJwk,
  OAuthPublicJwk,
} from "./types";

const DEFAULT_KEY_FILE = "oauth-signing-key.jwk";
const DEFAULT_A2A_KEY_FILE = "a2a-signing-key.jwk";

const oauthPrivateJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string(),
  y: z.string(),
  d: z.string(),
  kid: z.string().optional(),
});

const a2aPrivateJwkSchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string(),
  d: z.string(),
  kid: z.string().optional(),
});

export interface AuthKeyStoreOptions {
  storageDir: string;
  keyFile?: string;
  runtimeDatabase?: AuthRuntimeDatabase;
}

function ecThumbprint(
  publicJwk: Pick<OAuthPublicJwk, "crv" | "kty" | "x" | "y">,
): string {
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  });
  return sha256Base64Url(canonical);
}

function okpThumbprint(
  publicJwk: Pick<A2APublicJwk, "crv" | "kty" | "x">,
): string {
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
  });
  return sha256Base64Url(canonical);
}

function publicFromOAuthPrivate(privateJwk: OAuthPrivateJwk): OAuthPublicJwk {
  return {
    kty: "EC",
    crv: "P-256",
    x: privateJwk.x,
    y: privateJwk.y,
    kid: privateJwk.kid,
    use: "sig",
    alg: "ES256",
  };
}

function publicFromA2APrivate(privateJwk: A2APrivateJwk): A2APublicJwk {
  return {
    kty: "OKP",
    crv: "Ed25519",
    x: privateJwk.x,
    kid: privateJwk.kid,
    use: "sig",
    alg: "EdDSA",
  };
}

async function generateOAuthPrivateJwk(): Promise<OAuthPrivateJwk> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );

  const parsed = oauthPrivateJwkSchema.safeParse(
    await crypto.subtle.exportKey("jwk", keyPair.privateKey),
  );
  if (!parsed.success) {
    throw new Error("Generated OAuth signing key is not a P-256 private JWK");
  }

  return normalizeOAuthPrivateJwk(parsed.data);
}

function generateA2APrivateJwk(): A2APrivateJwk {
  const { privateKey } = generateKeyPairSync("ed25519");
  const parsed = a2aPrivateJwkSchema.safeParse(
    privateKey.export({ format: "jwk" }),
  );
  if (!parsed.success) {
    throw new Error("Generated A2A signing key is not an Ed25519 private JWK");
  }

  return normalizeA2APrivateJwk(parsed.data);
}

function normalizeOAuthPrivateJwk(
  jwk: z.infer<typeof oauthPrivateJwkSchema>,
): OAuthPrivateJwk {
  return {
    kty: "EC",
    crv: "P-256",
    x: jwk.x,
    y: jwk.y,
    d: jwk.d,
    kid: jwk.kid ?? ecThumbprint(jwk),
    use: "sig",
    alg: "ES256",
  };
}

function normalizeA2APrivateJwk(
  jwk: z.infer<typeof a2aPrivateJwkSchema>,
): A2APrivateJwk {
  return {
    kty: "OKP",
    crv: "Ed25519",
    x: jwk.x,
    d: jwk.d,
    kid: jwk.kid ?? okpThumbprint(jwk),
    use: "sig",
    alg: "EdDSA",
  };
}

export class AuthKeyStore {
  private readonly keyFile: string;
  private readonly runtimeDatabase: AuthRuntimeDatabase | undefined;
  private cachedKey: OAuthPrivateJwk | undefined;
  private loadPromise: Promise<OAuthPrivateJwk> | undefined;

  constructor(options: AuthKeyStoreOptions) {
    this.keyFile = join(
      options.storageDir,
      options.keyFile ?? DEFAULT_KEY_FILE,
    );
    this.runtimeDatabase = options.runtimeDatabase;
  }

  async getPrivateJwk(): Promise<OAuthPrivateJwk> {
    if (this.cachedKey) return this.cachedKey;

    this.loadPromise ??= this.loadOrCreateKey();
    try {
      this.cachedKey = await this.loadPromise;
      return this.cachedKey;
    } catch (error) {
      this.loadPromise = undefined;
      throw error;
    }
  }

  private async loadOrCreateKey(): Promise<OAuthPrivateJwk> {
    if (this.runtimeDatabase) {
      return this.loadOrCreateDatabaseKey();
    }

    const existing = await this.readExistingKey();
    if (existing) return existing;

    const generated = await generateOAuthPrivateJwk();
    await writePrivateJwk(this.keyFile, generated);
    return generated;
  }

  private async loadOrCreateDatabaseKey(): Promise<OAuthPrivateJwk> {
    if (!this.runtimeDatabase) {
      throw new Error("Auth runtime database is not configured");
    }

    await this.runtimeDatabase.start();
    const [active] = await this.runtimeDatabase.db
      .select()
      .from(oauthSigningKeys)
      .where(
        and(
          eq(oauthSigningKeys.purpose, "oauth"),
          eq(oauthSigningKeys.status, "active"),
        ),
      )
      .limit(1);
    if (active) {
      return this.parseStoredKey(active.privateJwk, active.kid);
    }

    const key =
      (await this.readExistingKey()) ?? (await generateOAuthPrivateJwk());
    await this.runtimeDatabase.db.insert(oauthSigningKeys).values({
      kid: key.kid,
      purpose: "oauth",
      privateJwk: JSON.stringify(key),
      status: "active",
      createdAt: Date.now(),
    });
    return key;
  }

  async getPublicJwk(): Promise<OAuthPublicJwk> {
    return publicFromOAuthPrivate(await this.getPrivateJwk());
  }

  private parseStoredKey(value: string, expectedKid: string): OAuthPrivateJwk {
    const parsed = oauthPrivateJwkSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      throw new Error(
        `OAuth signing key ${expectedKid} in auth database is not a private P-256 JWK`,
      );
    }

    const normalized = normalizeOAuthPrivateJwk(parsed.data);
    if (normalized.kid !== expectedKid) {
      throw new Error(
        `OAuth signing key ${expectedKid} in auth database has mismatched kid ${normalized.kid}`,
      );
    }
    return normalized;
  }

  private async readExistingKey(): Promise<OAuthPrivateJwk | undefined> {
    try {
      const parsed = oauthPrivateJwkSchema.safeParse(
        JSON.parse(await readFile(this.keyFile, "utf8")),
      );
      if (!parsed.success) {
        throw new Error(
          `OAuth signing key at ${this.keyFile} is not a private P-256 JWK`,
        );
      }
      return normalizeOAuthPrivateJwk(parsed.data);
    } catch (error) {
      if (isFileNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

export class A2AKeyStore {
  private readonly keyFile: string;
  private readonly runtimeDatabase: AuthRuntimeDatabase | undefined;
  private cachedKey: A2APrivateJwk | undefined;
  private loadPromise: Promise<A2APrivateJwk> | undefined;

  constructor(options: AuthKeyStoreOptions) {
    this.keyFile = join(
      options.storageDir,
      options.keyFile ?? DEFAULT_A2A_KEY_FILE,
    );
    this.runtimeDatabase = options.runtimeDatabase;
  }

  async getPrivateJwk(): Promise<A2APrivateJwk> {
    if (this.cachedKey) return this.cachedKey;

    this.loadPromise ??= this.loadOrCreateKey();
    try {
      this.cachedKey = await this.loadPromise;
      return this.cachedKey;
    } catch (error) {
      this.loadPromise = undefined;
      throw error;
    }
  }

  private async loadOrCreateKey(): Promise<A2APrivateJwk> {
    if (this.runtimeDatabase) {
      return this.loadOrCreateDatabaseKey();
    }

    const existing = await this.readExistingKey();
    if (existing) return existing;

    const generated = generateA2APrivateJwk();
    await writePrivateJwk(this.keyFile, generated);
    return generated;
  }

  private async loadOrCreateDatabaseKey(): Promise<A2APrivateJwk> {
    if (!this.runtimeDatabase) {
      throw new Error("Auth runtime database is not configured");
    }

    await this.runtimeDatabase.start();
    const [active] = await this.runtimeDatabase.db
      .select()
      .from(oauthSigningKeys)
      .where(
        and(
          eq(oauthSigningKeys.purpose, "a2a"),
          eq(oauthSigningKeys.status, "active"),
        ),
      )
      .limit(1);
    if (active) {
      return this.parseStoredKey(active.privateJwk, active.kid);
    }

    const key = (await this.readExistingKey()) ?? generateA2APrivateJwk();
    await this.runtimeDatabase.db.insert(oauthSigningKeys).values({
      kid: key.kid,
      purpose: "a2a",
      privateJwk: JSON.stringify(key),
      status: "active",
      createdAt: Date.now(),
    });
    return key;
  }

  async getPublicJwk(): Promise<A2APublicJwk> {
    return publicFromA2APrivate(await this.getPrivateJwk());
  }

  private parseStoredKey(value: string, expectedKid: string): A2APrivateJwk {
    const parsed = a2aPrivateJwkSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      throw new Error(
        `A2A signing key ${expectedKid} in auth database is not a private Ed25519 JWK`,
      );
    }

    const normalized = normalizeA2APrivateJwk(parsed.data);
    if (normalized.kid !== expectedKid) {
      throw new Error(
        `A2A signing key ${expectedKid} in auth database has mismatched kid ${normalized.kid}`,
      );
    }
    return normalized;
  }

  private async readExistingKey(): Promise<A2APrivateJwk | undefined> {
    try {
      const parsed = a2aPrivateJwkSchema.safeParse(
        JSON.parse(await readFile(this.keyFile, "utf8")),
      );
      if (!parsed.success) {
        throw new Error(
          `A2A signing key at ${this.keyFile} is not a private Ed25519 JWK`,
        );
      }
      return normalizeA2APrivateJwk(parsed.data);
    } catch (error) {
      if (isFileNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

async function writePrivateJwk(
  keyFile: string,
  jwk: OAuthPrivateJwk | A2APrivateJwk,
): Promise<void> {
  await mkdir(dirname(keyFile), { recursive: true, mode: 0o700 });
  await writeFile(keyFile, `${JSON.stringify(jwk, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(keyFile, 0o600);
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
