import { describe, expect, it, mock } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { AgentDiscoveryPlugin } from "../src/plugins/agent-plugin";
import { NetworkPiecePlugin } from "../src/plugins/network-piece-plugin";
import { networkPieceSchema } from "../src/schemas/network-piece";
import { agentEntitySchema } from "../src/schemas/agent";
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
const post = (rkey: string, cid: string, title: string): unknown => ({
  uri: `at://did:plc:peer/ai.rizom.brain.post/${rkey}`,
  cid,
  value: {
    $type: "ai.rizom.brain.post",
    title,
    summary: `${title}, in short.`,
    body: `${title}: the long form, in Becca's words.`,
    canonicalUrl: `https://becca.rizom.ai/essays/${rkey}`,
    createdAt: "2026-09-30T09:00:00.000Z",
  },
});

function repository(records: Record<string, unknown[]>): {
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
        ...(index + 1 < all.length ? { cursor: String(index + 1) } : {}),
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
  await new AgentDiscoveryPlugin().register(shell);
  await new NetworkPiecePlugin({}, { fetchFn }).register(shell);
  const entities = shell.getEntityService();
  for (const agent of agents) {
    await entities.createEntity({
      entity: agentEntitySchema.parse({
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
          url: `https://${agent.id}`,
          status: agent.status,
          discoveredAt: "2026-09-01T00:00:00.000Z",
          slug: agent.id,
          ...(agent.repoDid ? { repoDid: agent.repoDid } : {}),
        },
      }),
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
  };
}

describe("indexing the network's published pieces", () => {
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
