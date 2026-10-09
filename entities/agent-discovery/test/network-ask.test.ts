import { describe, expect, it } from "bun:test";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import type { Plugin } from "@brains/plugins";
import { waitUntil } from "@brains/test-utils";
import { AgentDiscoveryPlugin } from "../src/plugins/agent-plugin";
import { AgentToolsPlugin } from "../src/plugins/agent-tools-plugin";
import {
  choosePeers,
  networkAskResultSchema,
  type PeerCandidate,
} from "../src/lib/network-ask";
import { createTestAgent } from "./fixtures/agent";

function peer(
  id: string,
  skills: Array<{ name: string; description: string; tags: string[] }>,
  extra: Partial<PeerCandidate> = {},
): PeerCandidate {
  return {
    id,
    name: id.split(".")[0] ?? id,
    url: `https://${id}`,
    status: "approved",
    about: "",
    skills,
    ...extra,
  };
}

const gardener = peer("jo.example", [
  {
    name: "Design Gardens",
    description: "Plan permaculture gardens and planting schedules.",
    tags: ["gardens", "permaculture"],
  },
]);
const cook = peer("sam.example", [
  {
    name: "Cook Seasonal Food",
    description: "Seasonal recipes from a kitchen garden.",
    tags: ["cooking", "recipes"],
  },
]);
const coder = peer("kai.example", [
  {
    name: "Build Brains",
    description: "Run and extend the brain runtime.",
    tags: ["architecture", "typescript"],
  },
]);
const botanist = peer("ivy.example", [
  {
    name: "Identify Plants",
    description: "Name garden plants and their needs.",
    tags: ["plants", "gardens"],
  },
]);

describe("choosePeers", () => {
  it("asks the peers whose skills match the question best, three at most", () => {
    const chosen = choosePeers("How do I plan a permaculture garden?", [
      coder,
      cook,
      gardener,
      botanist,
      peer("lee.example", [
        {
          name: "Grow Gardens",
          description: "Gardens for small balconies.",
          tags: ["gardens"],
        },
      ]),
    ]);
    expect(chosen.map((p) => p.id)).toEqual([
      "jo.example",
      "ivy.example",
      "lee.example",
    ]);
  });

  it("falls back to the two nearest peers when nothing matches", () => {
    const chosen = choosePeers("What is the weather on Mars?", [
      { ...coder, distance: 0.2 },
      { ...cook, distance: 0.6 },
      { ...gardener, distance: 0.4 },
      botanist,
    ]);
    expect(chosen.map((p) => p.id)).toEqual(["kai.example", "jo.example"]);
  });

  it("asks nobody when nothing matches and no peer has a place", () => {
    expect(choosePeers("What is the weather on Mars?", [coder, cook])).toEqual(
      [],
    );
  });

  it("never asks a peer that is archived or merely discovered", () => {
    const chosen = choosePeers("Who can plan a garden?", [
      { ...gardener, status: "archived" },
      { ...botanist, status: "discovered" },
      cook,
    ]);
    expect(chosen).toEqual([]);
  });
});

describe("network_ask", () => {
  type Harness = ReturnType<typeof createPluginHarness<Plugin>>;

  async function setup(): Promise<Harness> {
    const harness = createPluginHarness<Plugin>({ domain: "self.brain" });
    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin());
    const entityService = harness.getEntityService();
    for (const agent of [
      createTestAgent({
        id: "jo.example",
        name: "Jo",
        url: "https://jo.example/a2a",
        status: "approved",
        skills: gardener.skills,
      }),
      createTestAgent({
        id: "ivy.example",
        name: "Ivy",
        url: "https://ivy.example/a2a",
        status: "approved",
        skills: botanist.skills,
      }),
      createTestAgent({
        id: "lee.example",
        name: "Lee",
        url: "https://lee.example/a2a",
        status: "discovered",
        skills: gardener.skills,
      }),
      createTestAgent({
        id: "kai.example",
        name: "Kai",
        url: "https://kai.example/a2a",
        status: "approved",
        skills: coder.skills,
      }),
    ]) {
      await entityService.createEntity({ entity: agent });
    }
    return harness;
  }

  function networkAsk(
    harness: Harness,
  ): NonNullable<ReturnType<Harness["getCapabilities"]>["tools"][number]> {
    const tool = harness
      .getCapabilities()
      .tools.find((candidate) => candidate.name === "network_ask");
    if (!tool) throw new Error("Expected network_ask tool");
    return tool;
  }

  const guestContext = {
    interfaceType: "web-chat-guest",
    actor: { kind: "agent" as const, agentId: "brain-agent" },
    userPermissionLevel: "public" as const,
    isAnchor: false,
  };

  it("is a public read tool a guest turn may use", async () => {
    const tool = networkAsk(await setup());
    expect(tool.visibility).toBe("public");
    expect(tool.sideEffects).toBe("none");
  });

  it("asks the matching approved peers in parallel and attributes what they say", async () => {
    const harness = await setup();
    const asked: Array<{ agent: string; question: string }> = [];
    harness.subscribe<{ agent: string; question: string }, unknown>(
      "a2a:ask:request",
      async (message) => {
        asked.push(message.payload);
        // Both peers are in flight before either answers.
        await waitUntil(() => asked.length === 2, "both peers to be asked", {
          timeoutMs: 1_000,
        });
        if (message.payload.agent === "jo.example") {
          return {
            success: true,
            data: {
              state: "completed",
              response: "Start with the soil, then the water lines.",
              sources: [
                {
                  id: "post:soil-first",
                  title: "Soil first",
                  source: "post",
                  url: "https://jo.example/posts/soil-first",
                },
              ],
            },
          };
        }
        return {
          success: true,
          data: {
            state: "completed",
            response: "Plant what the site wants.",
            sources: [],
          },
        };
      },
    );

    const result = await networkAsk(harness).handler(
      { question: "How do I plan a permaculture garden?" },
      guestContext,
    );
    expectSuccess(result);
    const data = networkAskResultSchema.parse(result.data);

    expect(asked.map((entry) => entry.agent).sort()).toEqual([
      "ivy.example",
      "jo.example",
    ]);
    expect(asked[0]?.question).toBe("How do I plan a permaculture garden?");
    expect(data.answers).toEqual([
      {
        agent: "jo.example",
        brain: { name: "Jo", url: "https://jo.example" },
        answer: "Start with the soil, then the water lines.",
        sources: [
          {
            id: "post:soil-first",
            title: "Soil first",
            source: "post",
            url: "https://jo.example/posts/soil-first",
            brain: { name: "Jo", url: "https://jo.example" },
          },
        ],
      },
      {
        agent: "ivy.example",
        brain: { name: "Ivy", url: "https://ivy.example" },
        answer: "Plant what the site wants.",
        sources: [],
      },
    ]);
    expect(data.unanswered).toEqual([]);
    // The card's sources: each answering brain itself, then what it cited.
    expect(
      data.sources.map((source) => [source.id, source.brain?.name]),
    ).toEqual([
      ["agent:jo.example", "Jo"],
      ["post:soil-first", "Jo"],
      ["agent:ivy.example", "Ivy"],
    ]);
    expect(data.sources[0]).toMatchObject({
      title: "Jo",
      source: "agent",
      entityType: "agent",
      entityId: "jo.example",
      url: "https://jo.example",
      excerpt: "Start with the soil, then the water lines.",
      provenance: { toolName: "network_ask" },
    });
  });

  it("names the peers that refused or timed out and keeps the rest", async () => {
    const harness = await setup();
    harness.subscribe<{ agent: string; question: string }, unknown>(
      "a2a:ask:request",
      async (message) =>
        message.payload.agent === "jo.example"
          ? {
              success: false,
              error: "jo.example did not answer within 6000 ms",
            }
          : {
              success: true,
              data: {
                state: "completed",
                response: "Plant natives.",
                sources: [],
              },
            },
    );

    const result = await networkAsk(harness).handler(
      { question: "How do I plan a permaculture garden?" },
      guestContext,
    );
    expectSuccess(result);
    const data = networkAskResultSchema.parse(result.data);
    expect(data.answers.map((answer) => answer.agent)).toEqual(["ivy.example"]);
    expect(data.unanswered).toEqual([
      {
        agent: "jo.example",
        brain: { name: "Jo", url: "https://jo.example" },
        reason: "jo.example did not answer within 6000 ms",
      },
    ]);
  });

  it("reports an unreachable network rather than failing the turn", async () => {
    const harness = await setup();
    const result = await networkAsk(harness).handler(
      { question: "How do I plan a permaculture garden?" },
      guestContext,
    );
    expectSuccess(result);
    const data = networkAskResultSchema.parse(result.data);
    expect(data.answers).toEqual([]);
    expect(data.unanswered.map((entry) => entry.reason)).toEqual([
      "network unavailable",
      "network unavailable",
    ]);
  });

  it("asks nobody when no peer fits the question", async () => {
    const harness = await setup();
    const asked: string[] = [];
    harness.subscribe<{ agent: string }, unknown>(
      "a2a:ask:request",
      async (message) => {
        asked.push(message.payload.agent);
        return { success: false, error: "unexpected" };
      },
    );
    const result = await networkAsk(harness).handler(
      { question: "What is the weather on Mars?" },
      guestContext,
    );
    expectSuccess(result);
    expect(asked).toEqual([]);
    expect(networkAskResultSchema.parse(result.data)).toMatchObject({
      asked: [],
      answers: [],
      unanswered: [],
      sources: [],
    });
  });
});
