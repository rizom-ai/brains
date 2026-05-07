import { createLocalJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { JwksResponse } from "./types";

export interface VerifiedAccessToken {
  subject: string;
  issuer: string;
  audience: string | string[] | undefined;
  scope: string[];
  claims: JWTPayload;
}

export interface VerifyAccessTokenOptions {
  issuer: string;
  audience?: string;
}

export async function verifyAccessToken(
  token: string,
  jwks: JwksResponse,
  options: VerifyAccessTokenOptions,
): Promise<VerifiedAccessToken> {
  const keySet = createLocalJWKSet(jwks);
  const { payload } = await jwtVerify(token, keySet, {
    issuer: options.issuer,
    ...(options.audience ? { audience: options.audience } : {}),
    algorithms: ["ES256"],
  });

  if (!payload.sub) {
    throw new Error("Access token missing sub claim");
  }

  return {
    subject: payload.sub,
    issuer: payload.iss ?? options.issuer,
    audience: payload.aud,
    scope: parseScope(payload["scope"]),
    claims: payload,
  };
}

export function getBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  return authorization.slice("Bearer ".length).trim() || undefined;
}

function parseScope(scope: unknown): string[] {
  return typeof scope === "string"
    ? scope.split(/\s+/).filter((entry) => entry.length > 0)
    : [];
}
