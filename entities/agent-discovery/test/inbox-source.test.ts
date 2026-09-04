import { describe, expect, it } from "bun:test";
import type { Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { parseAgentEntity } from "../src/lib/agent-content";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { agentSightingsInbox } from "../src/inbox-source";
import agentDiscovery from "../src";
import { AGENT_PLUGIN_ID } from "./fixtures/agent-network";
import { createTestAgent } from "./fixtures/agent";

/**
 * The declaration, bound to a context the way the runtime binds it.
 *
 * The declaration is a plain object; binding is all a caller has to do.
 */
async function createSource(): Promise<{
  harness: ReturnType<typeof createPluginHarness<Plugin>>;
  source: {
    list: () => ReturnType<typeof agentSightingsInbox.list>;
    resolveDetail: (
      ...args: Parameters<
        NonNullable<typeof agentSightingsInbox.resolveDetail>
      > extends [unknown, ...infer TRest]
        ? TRest
        : never
    ) => ReturnType<NonNullable<typeof agentSightingsInbox.resolveDetail>>;
    act: (
      ...args: Parameters<typeof agentSightingsInbox.act> extends [
        unknown,
        ...infer TRest,
      ]
        ? TRest
        : never
    ) => ReturnType<typeof agentSightingsInbox.act>;
  };
}> {
  const harness = createPluginHarness<Plugin>();
  const plugins = instantiatePluginPackageDefinition(
    agentDiscovery,
    {},
    {
      name: "@brains/agent-discovery",
      version: "0.1.0",
    },
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);
  const context = harness.getReactionContext(AGENT_PLUGIN_ID);
  const resolveDetail = agentSightingsInbox.resolveDetail;
  if (!resolveDetail) throw new Error("The sightings inbox resolves no detail");
  return {
    harness,
    source: {
      list: () => agentSightingsInbox.list(context),
      resolveDetail: (...args) => resolveDetail(context, ...args),
      act: (...args) => agentSightingsInbox.act(context, ...args),
    },
  };
}

describe("agent sightings Inbox source", () => {
  it("projects each second-order agent with useful context and decisive actions", async () => {
    const { harness, source } = await createSource();
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "vale.example",
        name: "Vale",
        status: "discovered",
        discoveredAt: "2026-08-18T04:00:00.000Z",
        introducedBy: ["kai.brain", "lumen.brain"],
        hops: 2,
        about: "Researches resilient local knowledge systems.",
        skills: [
          {
            name: "Research",
            description: "Maps emerging practices.",
            tags: ["research"],
          },
        ],
      }),
    });
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "direct.example",
        status: "discovered",
      }),
    });
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "known.example",
        status: "approved",
        introducedBy: ["kai.brain"],
        hops: 2,
      }),
    });

    const items = await source.list();

    expect(items).toEqual([
      {
        id: "vale.example",
        title: "Vale · vale.example",
        summary:
          "Introduced by kai.brain and lumen.brain. Researches resilient local knowledge systems. Declared skills: Research.",
        receivedAt: "2026-08-18T04:00:00.000Z",
        urgency: "normal",
        entityRef: { entityType: "agent", entityId: "vale.example" },
        actions: [
          { id: "connect", label: "Connect", confirm: true },
          { id: "dismiss", label: "Dismiss", confirm: true },
        ],
      },
    ]);

    const detail = await source.resolveDetail(
      "vale.example",
      { permissionLevel: "admin" },
      new AbortController().signal,
    );
    expect(detail.kind).toBe("plain");
    expect(detail.truncated).toBe(false);
    expect(detail.text).toContain("Introduced by: kai.brain and lumen.brain");
    expect(detail.text).toContain("Research: Maps emerging practices.");
    harness.reset();
  });

  it("connects or dismisses a sighting through admin-only entity updates", async () => {
    const { harness, source } = await createSource();
    for (const id of ["connect.example", "dismiss.example"]) {
      await harness.getEntityService().createEntity({
        entity: createTestAgent({
          id,
          name: id,
          status: "discovered",
          introducedBy: ["kai.brain"],
          hops: 2,
        }),
      });
    }

    expect(
      source.act("connect.example", "connect", {
        permissionLevel: "trusted",
      }),
    ).rejects.toThrow("Agent sightings require admin permission");
    expect(
      source.act("connect.example", "resolve", {
        permissionLevel: "admin",
      }),
    ).rejects.toThrow("Invalid agent sighting Inbox action");

    await source.act("connect.example", "connect", {
      permissionLevel: "admin",
    });
    await source.act("dismiss.example", "dismiss", {
      permissionLevel: "admin",
    });

    const connected = await harness.getEntityService().getEntity({
      entityType: "agent",
      id: "connect.example",
    });
    const dismissed = await harness.getEntityService().getEntity({
      entityType: "agent",
      id: "dismiss.example",
    });
    expect(connected?.metadata["status"]).toBe("approved");
    expect(dismissed?.metadata["status"]).toBe("archived");
    if (!connected || !dismissed) throw new Error("Expected saved agents");
    const connectedFrontmatter = parseAgentEntity(connected).frontmatter;
    expect(connectedFrontmatter.status).toBe("approved");
    expect(connectedFrontmatter.introducedBy).toBeUndefined();
    expect(connectedFrontmatter.hops).toBeUndefined();
    expect(parseAgentEntity(dismissed).frontmatter).toMatchObject({
      status: "archived",
      introducedBy: ["kai.brain"],
      hops: 2,
    });
    expect(await source.list()).toEqual([]);
    harness.reset();
  });
});
