import type { PrivateJwk, JsonValue } from "./types";

export interface JwtClaims {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  scope?: string;
  [key: string]: JsonValue | undefined;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function derToRawEcdsaSignature(signature: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(signature);
  if (bytes[0] !== 0x30) {
    return bytes;
  }

  let offset = 2;
  if (bytes[1] && bytes[1] > 0x80) {
    offset += bytes[1] - 0x80;
  }

  if (bytes[offset] !== 0x02) {
    throw new Error("Invalid DER ECDSA signature");
  }
  const rLength = bytes[offset + 1];
  if (rLength === undefined) {
    throw new Error("Invalid DER ECDSA signature");
  }
  const rStart = offset + 2;
  const r = bytes.slice(rStart, rStart + rLength);

  offset = rStart + rLength;
  if (bytes[offset] !== 0x02) {
    throw new Error("Invalid DER ECDSA signature");
  }
  const sLength = bytes[offset + 1];
  if (sLength === undefined) {
    throw new Error("Invalid DER ECDSA signature");
  }
  const sStart = offset + 2;
  const s = bytes.slice(sStart, sStart + sLength);

  return new Uint8Array([...normalizeEcPart(r), ...normalizeEcPart(s)]);
}

function normalizeEcPart(part: Uint8Array): Uint8Array {
  let normalized = part;
  while (normalized.length > 32 && normalized[0] === 0) {
    normalized = normalized.slice(1);
  }
  if (normalized.length > 32) {
    throw new Error("Invalid P-256 signature component length");
  }
  if (normalized.length === 32) {
    return normalized;
  }

  const padded = new Uint8Array(32);
  padded.set(normalized, 32 - normalized.length);
  return padded;
}

export async function signJwt(
  privateJwk: PrivateJwk,
  claims: JwtClaims,
): Promise<string> {
  const header = {
    typ: "JWT",
    alg: "ES256",
    kid: privateJwk.kid,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(derToRawEcdsaSignature(signature)).toString("base64url")}`;
}
