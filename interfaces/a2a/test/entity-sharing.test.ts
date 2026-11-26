import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService, authServicePlugin } from "@brains/auth-service";
import {
  ENTITY_SHARING_EXTENSION_URI,
  sharedEntitySchema,
  sharedEntityStatement,
} from "@brains/contracts";
import {
  JwksResolver,
  keyFingerprint,
  signRequest,
  verifyStatement,
} from "@brains/http-signatures";
import { computeContentHash } from "@brains/utils/hash";
import type { Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { createA2APlugin, routeOf } from "./a2a-plugin";

/**
 * A brain serving its shared entities to an approved peer over the
 * entity-sharing extension: a signed message/send whose data part names one
 * entity, answered before any model sees it.
 */
describe("the entity-sharing extension", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let agentTurns: number;
  const tempDirs: string[] = [];

  beforeEach(() => {
    harness = createPluginHarness({ logger: createSilentLogger("a2a-share") });
    agentTurns = 0;
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    await harness.getMockShell().getDaemonRegistry().stopPlugin("auth-service");
    await harness.reset();
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempStorageDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "brains-a2a-share-"));
    tempDirs.push(dir);
    return dir;
  }

  const note = (
    id: string,
    visibility: "public" | "shared" | "restricted",
  ): {
    id: string;
    entityType: string;
    content: string;
    metadata: Record<string, unknown>;
    visibility: "public" | "shared" | "restricted";
    contentHash: string;
  } => ({
    id,
    entityType: "note",
    content: `---\ntitle: ${id}\n---\nThe text of ${id}.`,
    metadata: { title: id },
    visibility,
    contentHash: `hash-of-${id}`,
  });

  /** A serving brain, and a peer whose signed requests it trusts or not. */
  async function serving(trust: "trusted" | "none"): Promise<{
    plugin: Plugin;
    peer: AuthService;
  }> {
    harness.getMockShell().serveHttp();
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "https://local.example",
      }),
    );
    harness.setAgentService({
      chat: async () => {
        agentTurns += 1;
        return {
          text: "the agent answered",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
      confirmPendingAction: async () => ({
        text: "ok",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
      invalidateAgent: () => {},
    });
    harness.addEntities([
      note("shared-note", "shared"),
      note("public-note", "public"),
      note("restricted-note", "restricted"),
      {
        id: "draft-post",
        entityType: "post",
        content: "---\ntitle: Draft\nstatus: draft\n---\nNot published.",
        metadata: { title: "Draft", status: "draft" },
        visibility: "shared",
      },
    ]);
    const peer = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://remote.example",
    });
    const peerJwks = await peer.getJwks();
    const peerKey = peerJwks.keys.find((key) => key.alg === "EdDSA");
    if (!peerKey) throw new Error("Expected the peer's A2A key");
    if (trust === "trusted") {
      const local = harness.getMockShell().getAuthRegistry().get();
      if (!(local instanceof AuthService)) throw new Error("Expected auth");
      await local.grantA2APeerTrust({
        domain: "remote.example",
        keyFingerprint: keyFingerprint(peerKey),
        grantedLevel: "trusted",
      });
    }
    const plugin = createA2APlugin(
      {},
      { fetch: async (): Promise<Response> => Response.json(peerJwks) },
    );
    await harness.installPlugin(plugin);
    return { plugin, peer };
  }

  function getRequest(entityType: string, id: string): unknown {
    return {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: "msg-1",
          role: "user",
          parts: [{ kind: "data", data: { op: "get", entityType, id } }],
        },
      },
    };
  }

  async function ask(
    brain: { plugin: Plugin; peer: AuthService },
    body: unknown,
    options: { extension?: boolean; signed?: boolean; tamper?: boolean } = {},
  ): Promise<Response> {
    const bodyText = JSON.stringify(body);
    const headers = new Headers({
      "Content-Type": "application/json",
      ...(options.extension !== false && {
        "X-A2A-Extensions": ENTITY_SHARING_EXTENSION_URI,
      }),
    });
    if (options.signed !== false) {
      const key = await brain.peer.getA2ASigningKey();
      await signRequest(
        { method: "POST", url: "http://brain/a2a", headers, body: bodyText },
        key.privateJwk,
        key.keyId,
      );
    }
    return routeOf(brain.plugin, "POST", "/a2a").handler(
      new Request("http://brain/a2a", {
        method: "POST",
        headers,
        body: options.tamper ? `${bodyText} ` : bodyText,
      }),
    );
  }

  it("serves a shared entity to a trusted peer, with no model in the path", async () => {
    const brain = await serving("trusted");

    const response = await ask(brain, getRequest("note", "shared-note"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        kind: "message",
        messageId: expect.any(String),
        role: "agent",
        parts: [
          {
            kind: "data",
            data: {
              entityType: "note",
              id: "shared-note",
              markdown:
                "---\ntitle: shared-note\n---\nThe text of shared-note.",
              // The hash of the document served, so a copy can be checked.
              contentHash: computeContentHash(
                "---\ntitle: shared-note\n---\nThe text of shared-note.",
              ),
              attestation: {
                signedAt: expect.any(String),
                keyId: expect.stringContaining(
                  "https://local.example/.well-known/jwks.json#",
                ),
                signature: expect.any(String),
              },
            },
          },
        ],
      },
    });
    expect(agentTurns).toBe(0);
  });

  it("signs what it serves with the brain's own key", async () => {
    const brain = await serving("trusted");
    const local = harness.getMockShell().getAuthRegistry().get();
    if (!(local instanceof AuthService)) throw new Error("Expected auth");
    const localJwks = await local.getJwks();

    const response = await ask(brain, getRequest("note", "shared-note"));
    const answer: unknown = await response.json();
    const served = sharedEntitySchema.parse(
      Reflect.get(
        Reflect.get(Reflect.get(Object(answer), "result"), "parts")[0],
        "data",
      ),
    );

    expect(
      await verifyStatement(
        sharedEntityStatement(served),
        served.attestation.signature,
        served.attestation.keyId,
        new JwksResolver({
          fetch: async (): Promise<Response> => Response.json(localJwks),
        }),
      ),
    ).toMatchObject({ domain: "local.example" });
  });

  it("never serves onward a copy it took from another brain", async () => {
    const brain = await serving("trusted");
    harness.addEntities([
      {
        id: "peer-example--note--pricing",
        entityType: "shared-copy",
        content: "What a third brain charges.",
        metadata: { title: "Pricing", sourceBrain: "third.example" },
        visibility: "shared",
      },
    ]);

    const response = await ask(
      brain,
      getRequest("shared-copy", "peer-example--note--pricing"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("answers every miss with the same 404", async () => {
    const brain = await serving("trusted");

    const misses = await Promise.all(
      [
        getRequest("note", "restricted-note"),
        getRequest("note", "public-note"),
        getRequest("note", "no-such-note"),
        getRequest("no-such-type", "shared-note"),
        getRequest("post", "draft-post"),
      ].map(async (body) => {
        const response = await ask(brain, body);
        return { status: response.status, body: await response.text() };
      }),
    );

    expect(new Set(misses.map(({ status }) => status))).toEqual(new Set([404]));
    expect(new Set(misses.map(({ body }) => body)).size).toBe(1);
    expect(agentTurns).toBe(0);
  });

  it("gives a peer it does not trust the same 404 for a shared entity", async () => {
    const trusted = await serving("trusted");
    const miss = await (
      await ask(trusted, getRequest("note", "no-such-note"))
    ).text();
    await harness.reset();
    harness = createPluginHarness({ logger: createSilentLogger("a2a-share") });
    const brain = await serving("none");

    const response = await ask(brain, getRequest("note", "shared-note"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(miss);
  });

  it("gives an unsigned caller the 404 too", async () => {
    const brain = await serving("trusted");

    const response = await ask(brain, getRequest("note", "shared-note"), {
      signed: false,
    });

    expect(response.status).toBe(404);
  });

  it("refuses a request whose signature does not verify with 401", async () => {
    const brain = await serving("trusted");

    const response = await ask(brain, getRequest("note", "shared-note"), {
      tamper: true,
    });

    expect(response.status).toBe(401);
    expect(agentTurns).toBe(0);
  });

  it("hands the same message to the agent when the extension is not asked for", async () => {
    const brain = await serving("trusted");

    const response = await ask(
      brain,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "message/send",
        params: {
          message: {
            kind: "message",
            messageId: "msg-1",
            role: "user",
            parts: [
              { kind: "text", text: "Do you have a note for me?" },
              {
                kind: "data",
                data: { op: "get", entityType: "note", id: "shared-note" },
              },
            ],
          },
        },
      },
      { extension: false },
    );

    expect(response.status).toBe(200);
    await waitUntil(() => agentTurns === 1, "the agent to take the turn");
  });

  it("refuses an extension request that names no entity with the 404", async () => {
    const brain = await serving("trusted");

    const response = await ask(brain, {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: "msg-1",
          role: "user",
          parts: [{ kind: "text", text: "give me everything" }],
        },
      },
    });

    expect(response.status).toBe(404);
    expect(agentTurns).toBe(0);
  });

  it("declares the extension on the Agent Card", async () => {
    const brain = await serving("trusted");
    harness.getMockShell().getProfileKindRegistry().finalize();
    await brain.plugin.ready?.();

    const response = await routeOf(
      brain.plugin,
      "GET",
      "/.well-known/agent-card.json",
    ).handler(new Request("http://brain/.well-known/agent-card.json"));
    const card = await response.json();

    expect(
      card.capabilities?.extensions?.map(
        (extension: { uri: string }) => extension.uri,
      ),
    ).toContain(ENTITY_SHARING_EXTENSION_URI);
  });
});
