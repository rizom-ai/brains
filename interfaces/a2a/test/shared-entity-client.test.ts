import { describe, expect, it, mock } from "bun:test";
import { generateKeyPairSync, type JsonWebKey } from "node:crypto";
import {
  ENTITY_SHARING_EXTENSION_URI,
  sharedEntityStatement,
  type SharedEntity,
} from "@brains/contracts";
import { signStatement } from "@brains/http-signatures";
import { computeContentHash } from "@brains/utils/hash";
import type { A2AClientDeps, FetchFn } from "../src/client";
import { fetchSharedEntity } from "../src/shared-entity-client";

const PEER = "peer.example";
const PRICING = "---\ntitle: Pricing\n---\nWhat we charge.";

/** A brain's signing key, as its JWKS publishes it. */
function brainKey(domain: string): {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  keyId: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  publicJwk["kid"] = "k1";
  return {
    privateJwk: privateKey.export({ format: "jwk" }),
    publicJwk,
    keyId: `https://${domain}/.well-known/jwks.json#k1`,
  };
}

const peerKey = brainKey(PEER);
const strangerKey = brainKey("stranger.example");

/** An entity as a brain serves it: its document, that document's hash, signed. */
function served(
  input: {
    id?: string;
    markdown?: string;
    key?: ReturnType<typeof brainKey>;
  } = {},
): SharedEntity {
  const key = input.key ?? peerKey;
  const unsigned = {
    entityType: "note",
    id: input.id ?? "pricing",
    markdown: input.markdown ?? PRICING,
    contentHash: computeContentHash(input.markdown ?? PRICING),
  };
  const signedAt = "2026-11-26T08:00:00.000Z";
  return {
    ...unsigned,
    attestation: {
      signedAt,
      keyId: key.keyId,
      signature: signStatement(
        sharedEntityStatement({ ...unsigned, attestation: { signedAt } }),
        key.privateJwk,
      ),
    },
  };
}

function answering(data: unknown): () => Response {
  return () =>
    Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        kind: "message",
        messageId: "m",
        role: "agent",
        parts: [{ kind: "data", data }],
      },
    });
}

interface Saved {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

function directory(status: string | undefined): A2AClientDeps["entityService"] {
  const saved: Saved | null = status
    ? {
        id: PEER,
        content: "",
        metadata: { status, url: `https://${PEER}/a2a` },
      }
    : null;
  return { getEntity: async () => saved };
}

/** The peer as the network shows it: its Agent Card and its A2A endpoint. */
function peer(
  input: {
    shares?: boolean;
    answer?: () => Response;
  } = {},
): { fetch: FetchFn; requests: Request[] } {
  const requests: Request[] = [];
  const fetch = mock(
    async (url: string | URL | Request, init?: RequestInit) => {
      const request = new Request(url, init);
      requests.push(request);
      if (request.url.endsWith("/.well-known/agent-card.json")) {
        return Response.json({
          name: "Peer",
          url: `https://${PEER}/a2a`,
          capabilities: {
            extensions:
              input.shares === false
                ? []
                : [{ uri: ENTITY_SHARING_EXTENSION_URI }],
          },
        });
      }
      if (request.url.endsWith("/.well-known/jwks.json")) {
        return Response.json({
          keys: [
            request.url.includes(PEER)
              ? peerKey.publicJwk
              : strangerKey.publicJwk,
          ],
        });
      }
      return (input.answer ?? answering(served()))();
    },
  );
  return { fetch, requests };
}

const signer: NonNullable<A2AClientDeps["requestSigner"]> = async (request) => {
  request.headers["signature"] = "signed";
};

function deps(
  network: { fetch: FetchFn },
  options: {
    status?: string | undefined;
    approved?: boolean;
    signed?: boolean;
  } = {},
): A2AClientDeps {
  return {
    fetch: network.fetch,
    entityService: directory("status" in options ? options.status : "approved"),
    isContactApproved: async () => options.approved ?? true,
    ...(options.signed !== false && { requestSigner: signer }),
  };
}

const wanted = { agent: PEER, entityType: "note", id: "pricing" };

describe("asking a peer for one shared entity", () => {
  it("returns the entity an approved peer serves", async () => {
    const network = peer();

    const result = await fetchSharedEntity(wanted, deps(network));

    expect(result).toEqual({ status: "found", entity: served() });
    const sent = network.requests.find((request) => request.method === "POST");
    expect(sent?.url).toBe(`https://${PEER}/a2a`);
    expect(sent?.headers.get("x-a2a-extensions")).toBe(
      ENTITY_SHARING_EXTENSION_URI,
    );
    expect(sent?.headers.get("signature")).toBe("signed");
    expect(await sent?.json()).toMatchObject({
      method: "message/send",
      params: {
        message: {
          parts: [
            {
              kind: "data",
              data: { op: "get", entityType: "note", id: "pricing" },
            },
          ],
        },
      },
    });
  });

  for (const [why, options, code] of [
    ["is not approved", { approved: false }, "agent_not_approved"],
    ["is archived", { status: "archived" }, "agent_archived"],
    ["is not saved", { status: undefined }, "agent_not_saved"],
  ] as const) {
    it(`refuses a peer that ${why}, before any network contact`, async () => {
      const network = peer();

      const result = await fetchSharedEntity(wanted, deps(network, options));

      expect(result).toMatchObject({ status: "refused", code });
      expect(network.requests).toEqual([]);
    });
  }

  it("says not found when the peer answers 404", async () => {
    const network = peer({
      answer: () => Response.json({ error: "Not found" }, { status: 404 }),
    });

    expect(await fetchSharedEntity(wanted, deps(network))).toEqual({
      status: "not-found",
    });
  });

  it("refuses a peer whose card does not offer shared entities, without asking", async () => {
    const network = peer({ shares: false });

    const result = await fetchSharedEntity(wanted, deps(network));

    expect(result).toMatchObject({ status: "refused", code: "not_offered" });
    expect(network.requests).toHaveLength(1);
  });

  it("refuses to ask unsigned: a peer serves only callers it can verify", async () => {
    const network = peer();

    const result = await fetchSharedEntity(
      wanted,
      deps(network, { signed: false }),
    );

    expect(result).toMatchObject({ status: "refused", code: "unsigned" });
    expect(network.requests).toEqual([]);
  });

  it("refuses a document that is not the one the peer signed", async () => {
    const network = peer({
      answer: answering({ ...served(), markdown: `${PRICING} And more.` }),
    });

    expect(await fetchSharedEntity(wanted, deps(network))).toMatchObject({
      status: "refused",
      code: "unverified",
    });
  });

  it("refuses a hash the peer's signature does not cover", async () => {
    const forged = `${PRICING} And more.`;
    const network = peer({
      answer: answering({
        ...served(),
        markdown: forged,
        contentHash: computeContentHash(forged),
      }),
    });

    expect(await fetchSharedEntity(wanted, deps(network))).toMatchObject({
      status: "refused",
      code: "unverified",
    });
  });

  it("refuses an entity signed by a brain other than the peer asked", async () => {
    const network = peer({ answer: answering(served({ key: strangerKey })) });

    expect(await fetchSharedEntity(wanted, deps(network))).toMatchObject({
      status: "refused",
      code: "unverified",
    });
  });

  it("refuses an entity that comes unsigned", async () => {
    const { attestation: _unsigned, ...bare } = served();
    const network = peer({ answer: answering(bare) });

    expect(await fetchSharedEntity(wanted, deps(network))).toMatchObject({
      status: "refused",
      code: "unreadable_answer",
    });
  });

  it("refuses an answer that is not the entity asked for", async () => {
    const network = peer({
      answer: answering(served({ id: "something-else" })),
    });

    expect(await fetchSharedEntity(wanted, deps(network))).toMatchObject({
      status: "refused",
      code: "unreadable_answer",
    });
  });

  it("refuses when the peer fails", async () => {
    const network = peer({
      answer: () => new Response("boom", { status: 502 }),
    });

    expect(await fetchSharedEntity(wanted, deps(network))).toMatchObject({
      status: "refused",
      code: "peer_failed",
    });
  });
});
