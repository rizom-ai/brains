import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PrivateJwk, PublicJwk } from "./types";

const DEFAULT_KEY_FILE = "oauth-signing-key.jwk";

export interface AuthKeyStoreOptions {
  storageDir: string;
  keyFile?: string;
}

function isPrivateJwk(value: unknown): value is PrivateJwk {
  if (!value || typeof value !== "object") return false;
  const jwk = value as Record<string, unknown>;
  return (
    jwk["kty"] === "EC" &&
    jwk["crv"] === "P-256" &&
    typeof jwk["x"] === "string" &&
    typeof jwk["y"] === "string" &&
    typeof jwk["d"] === "string"
  );
}

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

  const exported = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  if (!isPrivateJwk(exported)) {
    throw new Error("Generated OAuth signing key is not a P-256 private JWK");
  }

  const kid = thumbprint(exported);
  return {
    ...exported,
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
      const parsed = JSON.parse(
        await readFile(this.keyFile, "utf8"),
      ) as unknown;
      if (!isPrivateJwk(parsed)) {
        throw new Error(
          `OAuth signing key at ${this.keyFile} is not a private P-256 JWK`,
        );
      }

      const kid =
        typeof parsed.kid === "string" ? parsed.kid : thumbprint(parsed);
      return {
        ...parsed,
        kid,
        use: "sig",
        alg: "ES256",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}
