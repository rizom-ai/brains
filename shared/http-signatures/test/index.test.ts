import { describe, expect, it } from "bun:test";
import { generateKeyPairSync, type JsonWebKey } from "node:crypto";
import {
  HttpSignatureVerificationError,
  JwksResolver,
  keyFingerprint,
  signRequest,
  verifyRequest,
  type HttpSignatureRequest,
} from "../src/index";

function createKeys(): {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  keyId: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });
  publicJwk["kid"] = "test-key";
  publicJwk["use"] = "sig";
  publicJwk["alg"] = "EdDSA";
  return {
    privateJwk,
    publicJwk,
    keyId: "https://peer.example/.well-known/jwks.json#test-key",
  };
}

function request(
  body = JSON.stringify({ hello: "world" }),
): HttpSignatureRequest {
  return {
    method: "POST",
    url: "https://receiver.example/a2a",
    headers: new Headers({ host: "receiver.example" }),
    body,
  };
}

function resolverFor(publicJwk: JsonWebKey): JwksResolver {
  return new JwksResolver({
    fetch: async (): Promise<Response> =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "cache-control": "max-age=60" },
      }),
  });
}

async function expectVerificationError(
  promise: Promise<unknown>,
  message?: string,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected verification to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpSignatureVerificationError);
    if (message && error instanceof Error) {
      expect(error.message).toContain(message);
    }
  }
}

describe("HTTP message signatures", () => {
  it("signs and verifies an Ed25519 request", async () => {
    const { privateJwk, publicJwk, keyId } = createKeys();
    const req = request();
    const now = new Date("2026-07-07T00:00:00Z");

    await signRequest(req, privateJwk, keyId, { now });
    const verified = await verifyRequest(req, resolverFor(publicJwk), { now });

    expect(verified).toEqual({
      keyId,
      domain: "peer.example",
      keyFingerprint: keyFingerprint(publicJwk),
    });
    expect(req.headers).toHaveProperty("get");
    expect((req.headers as Headers).get("signature-input")).toContain(
      'keyid="https://peer.example/.well-known/jwks.json#test-key"',
    );
    expect((req.headers as Headers).get("content-digest")).toStartWith(
      "sha-256=:",
    );
  });

  it("returns null when no signature is present", async () => {
    const { publicJwk } = createKeys();

    const verified = await verifyRequest(request(), resolverFor(publicJwk));

    expect(verified).toBe(null);
  });

  it("rejects a tampered body", async () => {
    const { privateJwk, publicJwk, keyId } = createKeys();
    const req = request("original");
    const now = new Date("2026-07-07T00:00:00Z");
    await signRequest(req, privateJwk, keyId, { now });
    req.body = "tampered";

    await expectVerificationError(
      verifyRequest(req, resolverFor(publicJwk), { now }),
    );
  });

  it("rejects stale signatures", async () => {
    const { privateJwk, publicJwk, keyId } = createKeys();
    const req = request();
    await signRequest(req, privateJwk, keyId, {
      now: new Date("2026-07-07T00:00:00Z"),
    });

    await expectVerificationError(
      verifyRequest(req, resolverFor(publicJwk), {
        now: new Date("2026-07-07T00:02:00Z"),
      }),
      "freshness window",
    );
  });

  it("refetches JWKS once when kid is missing from cache", async () => {
    const { privateJwk, publicJwk, keyId } = createKeys();
    const req = request();
    let calls = 0;
    const resolver = new JwksResolver({
      fetch: async (): Promise<Response> => {
        calls++;
        return new Response(
          JSON.stringify({ keys: calls === 1 ? [] : [publicJwk] }),
          { status: 200 },
        );
      },
    });

    await signRequest(req, privateJwk, keyId, {
      now: new Date("2026-07-07T00:00:00Z"),
    });
    const verified = await verifyRequest(req, resolver, {
      now: new Date("2026-07-07T00:00:00Z"),
    });

    expect(verified?.domain).toBe("peer.example");
    expect(calls).toBe(2);
  });
});
