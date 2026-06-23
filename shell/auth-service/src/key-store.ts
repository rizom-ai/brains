import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod-v4";
import { isFileNotFoundError } from "./fs-errors";
import type { PrivateJwk, PublicJwk } from "./types";

const DEFAULT_KEY_FILE = "oauth-signing-key.jwk";

export interface AuthKeyStoreOptions {
  storageDir: string;
  keyFile?: string;
}

interface PrivateJwkMaterial {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d: string;
  kid?: string;
}

const privateJwkMaterialSchema = z
  .looseObject({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string(),
    y: z.string(),
    d: z.string(),
    kid: z.string().optional(),
  })
  .transform(
    (jwk): PrivateJwkMaterial => ({
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
      d: jwk.d,
      ...(jwk.kid !== undefined ? { kid: jwk.kid } : {}),
    }),
  );

function thumbprint(
  publicJwk: Pick<PublicJwk, "crv" | "kty" | "x" | "y">,
): string {
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  });
  return createHash("sha256").update(canonical).digest("base64url");
}

function publicFromPrivate(privateJwk: PrivateJwk): PublicJwk {
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

async function generatePrivateJwk(): Promise<PrivateJwk> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );

  const exported = privateJwkMaterialSchema.safeParse(
    await crypto.subtle.exportKey("jwk", keyPair.privateKey),
  );
  if (!exported.success) {
    throw new Error("Generated OAuth signing key is not a P-256 private JWK");
  }

  const kid = thumbprint(exported.data);
  return {
    ...exported.data,
    kid,
    use: "sig",
    alg: "ES256",
  };
}

export class AuthKeyStore {
  private readonly keyFile: string;
  private cachedKey: PrivateJwk | undefined;
  private loadPromise: Promise<PrivateJwk> | undefined;

  constructor(options: AuthKeyStoreOptions) {
    this.keyFile = join(
      options.storageDir,
      options.keyFile ?? DEFAULT_KEY_FILE,
    );
  }

  async getPrivateJwk(): Promise<PrivateJwk> {
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

  private async loadOrCreateKey(): Promise<PrivateJwk> {
    const existing = await this.readExistingKey();
    if (existing) return existing;

    const generated = await generatePrivateJwk();
    await mkdir(dirname(this.keyFile), { recursive: true, mode: 0o700 });
    await writeFile(this.keyFile, `${JSON.stringify(generated, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.keyFile, 0o600);
    return generated;
  }

  async getPublicJwk(): Promise<PublicJwk> {
    return publicFromPrivate(await this.getPrivateJwk());
  }

  private async readExistingKey(): Promise<PrivateJwk | undefined> {
    try {
      const parsed = privateJwkMaterialSchema.safeParse(
        JSON.parse(await readFile(this.keyFile, "utf8")),
      );
      if (!parsed.success) {
        throw new Error(
          `OAuth signing key at ${this.keyFile} is not a private P-256 JWK`,
        );
      }

      const kid = parsed.data.kid ?? thumbprint(parsed.data);
      return {
        ...parsed.data,
        kid,
        use: "sig",
        alg: "ES256",
      };
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }
}
