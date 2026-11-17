import {
  parseAgentEntity,
  rewriteAgentContent,
} from "../src/lib/agent-content";
import { agentDiscoveryPlugins, installAll } from "./agent-discovery-plugins";
import { describe, expect, it } from "bun:test";
import type { InboxSource, Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { agentEntitySchema } from "../src/schemas/agent";
import { createTestAgent } from "./fixtures/agent";

/** The agent sightings source, as the Inbox reaches it. */
function sightingsOf(
  harness: ReturnType<typeof createPluginHarness<Plugin>>,
): InboxSource {
  const source = harness
    .getMockShell()
    .getInboxRegistry()
    .getSource("agent-sightings");
  if (!source) throw new Error("No agent sightings source");
  return source;
}

async function createSource(): Promise<{
  harness: ReturnType<typeof createPluginHarness<Plugin>>;
  source: InboxSource;
}> {
  const harness = createPluginHarness<Plugin>();
  await installAll(harness, agentDiscoveryPlugins());
  await harness.finalizeRegistration();
  return { harness, source: sightingsOf(harness) };
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

    if (!source.resolveDetail) throw new Error("No sighting detail");
    const detail = await source.resolveDetail(
      "vale.example",
      { permissionLevel: "admin" },
      new AbortController().signal,
    );
    expect(detail.kind).toBe("plain");
    expect(detail.truncated).toBe(false);
    expect(detail.text).toContain("Introduced by: kai.brain and lumen.brain");
    expect(detail.text).toContain("Research: Maps emerging practices.");
    await harness.reset();
  });

  it("connects or dismisses a sighting through entity updates", async () => {
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

    const connected = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "connect.example",
      },
      agentEntitySchema,
    );
    const dismissed = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "dismiss.example",
      },
      agentEntitySchema,
    );
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
    await harness.reset();
  });

  it("does not overwrite a card refresh that lands while a sighting is connected", async () => {
    const harness = createPluginHarness<Plugin>();
    await installAll(harness, agentDiscoveryPlugins());
    await harness.finalizeRegistration();
    const context = { entityService: harness.getEntityService() };
    await context.entityService.createEntity({
      entity: createTestAgent({
        id: "vale.example",
        status: "discovered",
        introducedBy: ["kai.brain"],
        hops: 2,
        about: "Before the refresh.",
      }),
    });
    const update = context.entityService.updateEntity.bind(
      context.entityService,
    );
    context.entityService.updateEntity = async (
      request,
    ): ReturnType<typeof update> => {
      const current = await context.entityService.getEntity(
        { entityType: "agent", id: "vale.example" },
        agentEntitySchema,
      );
      if (!current) throw new Error("Missing agent");
      await update({
        entity: {
          ...current,
          content: rewriteAgentContent(parseAgentEntity(current), {
            about: "After the refresh.",
          }),
        },
      });
      return update(request);
    };
    const source = sightingsOf(harness);

    const outcome = await source
      .act("vale.example", "connect", { permissionLevel: "admin" })
      .then(
        () => "connected",
        (error: unknown) => {
          expect(error).toEqual(
            new Error("The agent changed meanwhile; try again"),
          );
          return "conflict";
        },
      );

    expect(outcome).toBe("conflict");
    const current = await context.entityService.getEntity(
      { entityType: "agent", id: "vale.example" },
      agentEntitySchema,
    );
    if (!current) throw new Error("Missing agent");
    expect(parseAgentEntity(current).frontmatter.status).toBe("discovered");
    expect(current.content).toContain("After the refresh.");
    await harness.reset();
  });
});
