import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { defineServicePlugin, z } from "@brains/sdk/services";
import { createAgentContent } from "../src/lib/agent-content";
import { agent } from "../src/agent-entity";
import { networkPiece } from "../src/network-piece-entity";
import { networkPiecesCheck } from "../src/lib/network-pieces-check";
import { networkPieceSchema } from "../src/schemas/network-piece";
import { agentEntitySchema, type AgentEntity } from "../src/schemas/agent";
import type { AtprotoCardFetch } from "../src/lib/atproto-card-events";

// Rizom indexes the connected brains' published pieces from their ATProto
// repositories: approved agents with a repository, every projected
// collection, kept current on the directory's cadence, and never anyone
// else's cost.

type RecurringCheck = Parameters<
  ReturnType<
    ReturnType<typeof createMockShell>["getRecurringChecks"]
  >["register"]
>[0];

const PLC = {
  service: [{ id: "#atproto_pds", serviceEndpoint: "https://pds.test/" }],
};
/** Where every host of the fake network resolves; a public address unless a test says otherwise. */
let resolvedAddress = "93.184.216.34";

const post = (
  rkey: string,
  cid: string,
  title: string,
  {
    addressed = true,
    value = {},
  }: { addressed?: boolean; value?: Record<string, unknown> } = {},
): unknown => ({
  uri: `at://did:plc:peer/ai.rizom.brain.post/${rkey}`,
  cid,
  value: {
    $type: "ai.rizom.brain.post",
    title,
    summary: `${title}, in short.`,
    body: `${title}: the long form, in Becca's words.`,
    ...(addressed
      ? { canonicalUrl: `https://becca.rizom.ai/essays/${rkey}` }
      : {}),
    createdAt: "2026-09-30T09:00:00.000Z",
    ...value,
  },
});

function repository(
  records: Record<string, unknown[]>,
  homes: Record<string, string> = {},
  misbehaviour: { endless?: boolean } = {},
): {
  fetchFn: AtprotoCardFetch;
  calls: string[];
  outage: { down: boolean };
} {
  const calls: string[] = [];
  const outage = { down: false };
  const fetchFn: AtprotoCardFetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.href);
    if (outage.down) return new Response("gone", { status: 503 });
    if (url.pathname === "/.well-known/atproto-did") {
      const did = homes[url.hostname];
      return did
        ? new Response(did, { headers: { "content-type": "text/plain" } })
        : new Response("not found", { status: 404 });
    }
    if (url.hostname === "plc.directory") return Response.json(PLC);
    if (url.pathname.endsWith("/xrpc/com.atproto.repo.listRecords")) {
      const collection = url.searchParams.get("collection") ?? "";
      const cursor = url.searchParams.get("cursor");
      const all = records[collection] ?? [];
      // One record per page, to exercise the cursor.
      const index = cursor ? Number(cursor) : 0;
      const page = all.slice(index, index + 1);
      return Response.json({
        records: page,
        ...(misbehaviour.endless
          ? { cursor: String(index) }
          : index + 1 < all.length
            ? { cursor: String(index + 1) }
            : {}),
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchFn, calls, outage };
}

async function brain(
  fetchFn: AtprotoCardFetch,
  agents: Array<{
    id: string;
    status: "approved" | "discovered";
    repoDid?: string;
  }>,
): Promise<{
  shell: ReturnType<typeof createMockShell>;
  check: RecurringCheck;
  pieces: () => Promise<ReturnType<typeof networkPieceSchema.parse>[]>;
  agent: (id: string) => Promise<AgentEntity | null>;
}> {
  const shell = createMockShell();
  const checks: RecurringCheck[] = [];
  shell.getRecurringChecks = (): ReturnType<
    typeof shell.getRecurringChecks
  > => ({
    register: (definition) => {
      checks.push(definition);
      return (): void => {};
    },
  });
  const definition = defineServicePlugin(
    { id: "agents", config: z.object({}), entities: [agent, networkPiece] },
    {
      checks: () => [
        networkPiecesCheck({
          fetchFn,
          resolveHostname: async () => [resolvedAddress],
        }),
      ],
    },
  );
  for (const plugin of instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@brains/agent-discovery", version: "0.0.0-test" },
  ))
    await plugin.register(shell);
  const entities = shell.getEntityService();
  for (const agent of agents) {
    const entity = agentEntitySchema.parse({
      id: agent.id,
      entityType: "agent",
      content: `# ${agent.id}`,
      contentHash: "",
      created: "2026-09-01T00:00:00.000Z",
      updated: "2026-09-01T00:00:00.000Z",
      visibility: "public",
      metadata: {
        name: agent.id === "becca.rizom.ai" ? "Becca" : agent.id,
        kind: "person",
        brainName: agent.id,
        url: `https://${agent.id}/a2a`,
        status: agent.status,
        discoveredAt: "2026-09-01T00:00:00.000Z",
        slug: agent.id,
        ...(agent.repoDid ? { repoDid: agent.repoDid } : {}),
      },
    });
    await entities.createEntity({
      entity: {
        ...entity,
        content: createAgentContent({
          ...entity.metadata,
          kind: "person",
          brainName: agent.id,
          discoveredAt: "2026-09-01T00:00:00.000Z",
          about: "",
          skills: [],
          notes: "",
        }),
      },
    });
  }
  const check = checks.find((c) => c.id === "network-pieces-sync");
  if (!check) throw new Error("Expected the network pieces sync check");
  return {
    shell,
    check,
    pieces: async () =>
      (
        await entities.listEntities(
          {
            entityType: "network-piece",
            options: { filter: { visibilityScope: "public" } },
          },
          networkPieceSchema,
        )
      ).sort((a, b) => a.id.localeCompare(b.id)),
    agent: async (id: string) =>
      entities.getEntity({ entityType: "agent", id }, agentEntitySchema),
  };
}

describe("indexing the network's published pieces", () => {
  beforeEach(() => {
    resolvedAddress = "93.184.216.34";
  });

  it("keeps an approved brain's published records as pieces, cited to the brain", async () => {
    const { fetchFn, calls } = repository({
      "ai.rizom.brain.post": [
        post("3kabc", "bafy1", "Handoffs between teams"),
        post("3kdef", "bafy2", "Who to ask"),
      ],
    });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
      { id: "quiet.rizom.ai", status: "discovered", repoDid: "did:plc:quiet" },
      { id: "nodid.rizom.ai", status: "approved" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    const pieces = await b.pieces();
    expect(pieces.map((p) => p.id)).toEqual([
      "plc-peer--post--3kabc",
      "plc-peer--post--3kdef",
    ]);
    expect(pieces[0]?.metadata).toMatchObject({
      title: "Handoffs between teams",
      kind: "post",
      status: "published",
      brain: {
        did: "did:plc:peer",
        name: "Becca",
        url: "https://becca.rizom.ai",
      },
      origin: "https://becca.rizom.ai/essays/3kabc",
      collection: "ai.rizom.brain.post",
      rkey: "3kabc",
      cid: "bafy1",
      recordedAt: "2026-09-30T09:00:00.000Z",
    });
    expect(pieces[0]?.content).toContain("the long form, in Becca's words");
    expect(pieces[0]?.visibility).toBe("public");
    // Only the approved brain with a repository was read, every collection of it, through the cursor.
    expect(
      calls
        .filter((c) => c.includes("plc.directory"))
        .map((c) => c.split("/").pop()),
    ).toEqual(["did:plc:peer"]);
    expect(
      calls.filter((c) => c.includes("collection=ai.rizom.brain.post")).length,
    ).toBe(2);
    expect(
      new Set(
        calls
          .filter((c) => c.includes("listRecords"))
          .map((c) => new URL(c).searchParams.get("collection")),
      ).size,
    ).toBe(8);
  });

  it("leaves an unchanged record alone and deletes a withdrawn one", async () => {
    const records = {
      "ai.rizom.brain.post": [
        post("3kabc", "bafy1", "Handoffs"),
        post("3kdef", "bafy2", "Who to ask"),
      ],
    };
    const { fetchFn } = repository(records);
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    const entities = b.shell.getEntityService();
    const update = mock(entities.updateEntity.bind(entities));
    entities.updateEntity = update;
    records["ai.rizom.brain.post"] = [post("3kabc", "bafy1", "Handoffs")];
    await b.check.run({ signal: new AbortController().signal });
    expect(update).not.toHaveBeenCalled();
    expect((await b.pieces()).map((p) => p.id)).toEqual([
      "plc-peer--post--3kabc",
    ]);
  });

  it("sends a piece without a page address to its brain's home, never its endpoint", async () => {
    const { fetchFn } = repository({
      "ai.rizom.brain.post": [
        post("3kbare", "bafy9", "No address", { addressed: false }),
      ],
    });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    const [piece] = await b.pieces();
    expect(piece?.metadata.origin).toBe("https://becca.rizom.ai");
    expect(piece?.metadata.brain.url).toBe("https://becca.rizom.ai");
  });

  it("excerpts a record's opening lines as plain words, not markdown", async () => {
    const note = {
      uri: "at://did:plc:peer/ai.rizom.brain.note/cv",
      cid: "bafyn",
      value: {
        $type: "ai.rizom.brain.note",
        title: "Jan Hein Hoogstad",
        body: "# Jan Hein Hoogstad\n\n**Writer**, developer and [architect](https://x.test).\n\n## Work\n\n- Rizom",
        createdAt: "2026-09-30T09:00:00.000Z",
      },
    };
    const { fetchFn } = repository({ "ai.rizom.brain.note": [note] });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    const [piece] = await b.pieces();
    expect(piece?.metadata.excerpt).toBe(
      "Writer, developer and architect. Work Rizom",
    );
  });

  it("learns an approved brain's repository from its home when the directory has none", async () => {
    const { fetchFn, calls } = repository(
      { "ai.rizom.brain.post": [post("3kabc", "bafy1", "Handoffs")] },
      { "becca.rizom.ai": "did:plc:peer" },
    );
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved" },
      { id: "silent.rizom.ai", status: "approved" },
      { id: "quiet.rizom.ai", status: "discovered" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    expect((await b.pieces()).map((p) => p.id)).toEqual([
      "plc-peer--post--3kabc",
    ]);
    // The directory keeps what it learned; a home without a DID is left alone.
    expect((await b.agent("becca.rizom.ai"))?.metadata.repoDid).toBe(
      "did:plc:peer",
    );
    expect(
      (await b.agent("silent.rizom.ai"))?.metadata.repoDid,
    ).toBeUndefined();
    // Only approved brains are asked, each at its home.
    expect(
      calls.filter((c) => c.endsWith("/.well-known/atproto-did")).sort(),
    ).toEqual([
      "https://becca.rizom.ai/.well-known/atproto-did",
      "https://silent.rizom.ai/.well-known/atproto-did",
    ]);
  });

  it("indexes every connected brain, each piece to its own", async () => {
    const jo = {
      uri: "at://did:plc:jo/ai.rizom.brain.note/field",
      cid: "bafyjo",
      value: {
        $type: "ai.rizom.brain.note",
        title: "Field notes",
        body: "What the field taught us.",
        createdAt: "2026-09-30T09:00:00.000Z",
      },
    };
    const { fetchFn } = repository({
      "ai.rizom.brain.post": [post("3kabc", "bafy1", "Handoffs")],
      "ai.rizom.brain.note": [jo],
    });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
      { id: "jo.rizom.ai", status: "approved", repoDid: "did:plc:jo" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    const pieces = await b.pieces();
    // The fake repository answers every DID with the same records, so each
    // brain's pieces are keyed to it and cited to it.
    expect(pieces.map((p) => [p.id, p.metadata.brain.name])).toEqual([
      ["plc-jo--note--field", "jo.rizom.ai"],
      ["plc-jo--post--3kabc", "jo.rizom.ai"],
      ["plc-peer--note--field", "Becca"],
      ["plc-peer--post--3kabc", "Becca"],
    ]);
  });

  it("sends a piece to its page only over https; anything else goes to the brain's home", async () => {
    const odd = post("3kodd", "bafyo", "Odd address", {
      value: { canonicalUrl: "javascript:alert(1)" },
    });
    const plain = post("3kplain", "bafyp", "Plain address", {
      value: { canonicalUrl: "http://becca.rizom.ai/essays/plain" },
    });
    const { fetchFn } = repository({ "ai.rizom.brain.post": [odd, plain] });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    expect((await b.pieces()).map((p) => p.metadata.origin)).toEqual([
      "https://becca.rizom.ai",
      "https://becca.rizom.ai",
    ]);
  });

  it("stops reading a repository whose cursor never ends, and keeps its last index", async () => {
    const { fetchFn, calls } = repository(
      { "ai.rizom.brain.post": [post("3kabc", "bafy1", "Handoffs")] },
      {},
      { endless: true },
    );
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    expect(await b.pieces()).toEqual([]);
    expect(
      calls.filter((c) => c.includes("collection=ai.rizom.brain.post")).length,
    ).toBeLessThanOrEqual(51);
  });

  it("keeps a record's body within bounds", async () => {
    const long = post("3klong", "bafyl", "Long", {
      value: { body: "word ".repeat(20_000) },
    });
    const { fetchFn } = repository({ "ai.rizom.brain.post": [long] });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    const [piece] = await b.pieces();
    // The body bounded, plus the piece's own frontmatter.
    expect(piece?.content.length ?? 0).toBeLessThanOrEqual(25_000);
  });

  it("refuses a home or repository on a non-public address", async () => {
    resolvedAddress = "10.0.0.8";
    const { fetchFn } = repository({
      "ai.rizom.brain.post": [post("3kabc", "bafy1", "Handoffs")],
    });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    expect(await b.pieces()).toEqual([]);
  });

  it("keeps the last index when a brain's repository cannot be reached", async () => {
    const { fetchFn, outage } = repository({
      "ai.rizom.brain.post": [post("3kabc", "bafy1", "Handoffs")],
    });
    const b = await brain(fetchFn, [
      { id: "becca.rizom.ai", status: "approved", repoDid: "did:plc:peer" },
    ]);
    await b.check.run({ signal: new AbortController().signal });
    outage.down = true;
    const result = await b.check
      .run({ signal: new AbortController().signal })
      .catch((error: unknown) => error);
    // The check reports the outage without throwing the brain's pieces away.
    expect(result).not.toBeInstanceOf(Error);
    expect((await b.pieces()).map((p) => p.id)).toEqual([
      "plc-peer--post--3kabc",
    ]);
  });
});
