import { afterEach, describe, expect, it } from "bun:test";
import { atprotoBrainCardDiscoveredPayloadSchema } from "@brains/atproto-contracts";
import { AuthService } from "@brains/auth-service";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { type ToolContext, type ToolResponse } from "@brains/plugins";
import {
  confirmationArgs,
  createMockEntityPluginContext,
  createMockShell,
  expectConfirmation,
  expectSuccess,
  isDeclaredEntityType,
} from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import type { FetchLike } from "@brains/utils/fetch-like";
import { agentDiscoveryPlugins } from "./agent-discovery-plugins";
import {
  CARD_REFRESH_STATE_NAMESPACE,
  cardRefreshStateSchema,
  upsertAgentFromCard,
} from "../src/lib/atproto-card-events";
import { AGENT_ENTITY_TYPE } from "../src/lib/constants";
import { agentEntitySchema, type AgentEntity } from "../src/schemas/agent";
import { createAgentConnectTool } from "../src/tools/agent-connect";
import { scanAgentDirectories } from "../src/tools/agent-scan-directories";
import { createAgentSetTrustLevelTool } from "../src/tools/agent-set-trust-level";
import { createTestAgent } from "./fixtures/agent";

/**
 * Agents saved above public, against the real entity service on SQLite: the
 * in-memory fake overwrites a duplicate id where the database refuses it.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function realEntityService(): Promise<EntityService> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  // The package's declared agent type.
  const [agentType] = agentDiscoveryPlugins();
  if (!isDeclaredEntityType(agentType)) throw new Error("No agent type");
  registry.registerEntityType(
    AGENT_ENTITY_TYPE,
    agentType.schema,
    agentType.adapter,
  );
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async (): Promise<never> => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async (): Promise<never> => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  cleanups.push(async () => {
    service.close();
    await directory.cleanup();
  });
  return service;
}

function savedAgent(
  id: string,
  visibility: AgentEntity["visibility"],
): AgentEntity {
  return {
    ...createTestAgent({
      id,
      name: "Saved",
      url: `https://${id}/a2a`,
      status: "discovered",
      introducedBy: ["old.brain"],
      hops: 2,
      about: `Private notes about ${id}.`,
    }),
    visibility,
  };
}

/** Serves each host's Agent Card and the peers' directories. */
function network(directories: Record<string, string[]> = {}): {
  fetch: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (input): Promise<Response> => {
      const url = new URL(String(input));
      calls.push(url.toString());
      if (url.pathname === "/.well-known/agent-directory.json") {
        const listed = directories[url.hostname];
        if (!listed) return new Response("not found", { status: 404 });
        return Response.json({
          agents: listed.map((host) => ({
            name: host,
            url: `https://${host}/a2a`,
          })),
        });
      }
      return Response.json({
        name: `${url.hostname} Brain`,
        description: "A remote brain.",
        url: `https://${url.hostname}/a2a`,
      });
    },
  };
}

const allowAll = { assertEntityActionAllowed: (): void => {} };

function readFull(
  service: EntityService,
  id: string,
): Promise<AgentEntity | null> {
  return service.getEntity(
    { entityType: AGENT_ENTITY_TYPE, id, visibilityScope: "restricted" },
    agentEntitySchema,
  );
}

async function connect(
  service: EntityService,
  fetchFn: FetchLike,
  host: string,
  userPermissionLevel: "admin" | "trusted",
): Promise<ToolResponse> {
  const tool = createAgentConnectTool(
    { entityService: service, permissions: allowAll },
    fetchFn,
  );
  const toolContext: ToolContext = {
    interfaceType: "test",
    actor: { kind: "user", userId: "caller" },
    userPermissionLevel,
  };
  const confirmation = await tool.handler(
    { source: { kind: "url", url: host } },
    toolContext,
  );
  expectConfirmation(confirmation);
  return tool.handler(confirmationArgs(confirmation), toolContext);
}

describe("agent_connect for an agent already saved above public", () => {
  it("refuses a trusted caller an agent saved restricted, changing nothing", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: savedAgent("hidden.example", "restricted"),
    });
    const before = await readFull(service, "hidden.example");
    const remote = network();

    const result = await connect(
      service,
      remote.fetch,
      "hidden.example",
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Agent hidden.example is already saved and can't be changed at your access.",
      code: "agent_already_saved",
    });
    expect(remote.calls).toEqual([]);
    expect(await readFull(service, "hidden.example")).toEqual(before);
  });

  it("lets an admin approve and refresh an agent saved restricted", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: savedAgent("hidden.example", "restricted"),
    });

    const result = await connect(
      service,
      network().fetch,
      "hidden.example",
      "admin",
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      entityId: "hidden.example",
      status: "approved",
      created: false,
    });
    const saved = await readFull(service, "hidden.example");
    expect(saved?.visibility).toBe("restricted");
    expect(saved?.metadata.status).toBe("approved");
  });

  it("lets a trusted caller and an admin update an agent saved shared", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: savedAgent("team.example", "shared"),
    });

    const levels: Array<"trusted" | "admin"> = ["trusted", "admin"];
    for (const level of levels) {
      const result = await connect(
        service,
        network().fetch,
        "team.example",
        level,
      );
      expectSuccess(result);
      expect(result.data).toMatchObject({
        entityId: "team.example",
        status: "approved",
        created: false,
      });
    }
    const saved = await readFull(service, "team.example");
    expect(saved?.visibility).toBe("shared");
    expect(saved?.metadata.status).toBe("approved");
  });
});

describe("agent_scan_directories for sightings already saved above public", () => {
  it("counts them as already known, leaving them as saved", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: createTestAgent({
        id: "kai.brain",
        url: "https://kai.brain/a2a",
        status: "approved",
      }),
    });
    await service.createEntity({
      entity: savedAgent("hidden.example", "restricted"),
    });
    await service.createEntity({
      entity: savedAgent("team.example", "shared"),
    });
    // An approved peer saved restricted is not walked: sightings are saved
    // public and name the peers that introduced them.
    await service.createEntity({
      entity: {
        ...createTestAgent({
          id: "secret.brain",
          url: "https://secret.brain/a2a",
          status: "approved",
        }),
        visibility: "restricted",
      },
    });
    const before = await Promise.all([
      readFull(service, "hidden.example"),
      readFull(service, "team.example"),
    ]);

    const remote = network({
      "kai.brain": ["hidden.example", "team.example"],
      "secret.brain": ["fresh.example"],
    });

    const result = await scanAgentDirectories(
      { entityService: service, permissions: allowAll, domain: "self.brain" },
      remote.fetch,
    );

    expect(result).toMatchObject({
      peersScanned: 1,
      created: 0,
      updated: 0,
      alreadyKnown: 2,
    });
    expect(
      await Promise.all([
        readFull(service, "hidden.example"),
        readFull(service, "team.example"),
      ]),
    ).toEqual(before);
    expect(remote.calls.some((url) => url.includes("secret.brain"))).toBe(
      false,
    );
    expect(await readFull(service, "fresh.example")).toBeNull();
  });
});

/** A signed brain card from ATProto for the site at `host`. */
function brainCard(
  host: string,
): ReturnType<typeof atprotoBrainCardDiscoveredPayloadSchema.parse> {
  return atprotoBrainCardDiscoveredPayloadSchema.parse({
    repoDid: "did:plc:claimant",
    uri: "at://did:plc:claimant/ai.rizom.brain.card/self",
    cid: "bafy-claimant-card",
    record: {
      $type: "ai.rizom.brain.card",
      siteUrl: `https://${host}`,
      brain: {
        did: `did:web:${host}`,
        name: "Claimant Brain",
        role: "assistant",
        purpose: "A brain announced over ATProto.",
        values: ["openness"],
      },
      anchor: {
        did: "did:plc:anchor",
        name: "Claimant",
        category: "person",
        kind: "professional",
      },
      model: "ranger",
      version: "0.2.0-test",
      skills: [],
      createdAt: "2026-06-02T12:00:00.000Z",
      updatedAt: "2026-06-02T12:30:00.000Z",
    },
  });
}

describe("ATProto brain cards for agents already saved above public", () => {
  it("skips the card: no write, no refresh record, no announcement", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: savedAgent("hidden.example", "restricted"),
    });
    const before = await readFull(service, "hidden.example");
    const context = createMockEntityPluginContext({ entityService: service });

    const result = await upsertAgentFromCard(
      context,
      brainCard("hidden.example"),
    );

    expect(result).toMatchObject({ created: false, skipped: true });
    expect(await readFull(service, "hidden.example")).toEqual(before);
    expect(context.messaging.broadcast).not.toHaveBeenCalled();
    expect(
      await context.runtimeState
        .scoped({
          namespace: CARD_REFRESH_STATE_NAMESPACE,
          schema: cardRefreshStateSchema,
        })
        .get("hidden.example"),
    ).toBeNull();
  });

  it("still refreshes an agent saved public from its card", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: savedAgent("open.example", "public"),
    });
    const context = createMockEntityPluginContext({ entityService: service });

    const result = await upsertAgentFromCard(
      context,
      brainCard("open.example"),
    );

    expect(result).toMatchObject({ created: false });
    expect(result).not.toHaveProperty("skipped");
    const saved = await readFull(service, "open.example");
    expect(saved?.metadata.repoDid).toBe("did:plc:claimant");
    expect(saved?.visibility).toBe("public");
  });
});

describe("agent_set_trust_level for agents saved above public", () => {
  it("lets an admin set inbound trust for an agent saved restricted", async () => {
    const service = await realEntityService();
    await service.createEntity({
      entity: savedAgent("trust.example", "restricted"),
    });
    const storage = await createTestDirectory();
    const auth = new AuthService({
      storageDir: storage.dir,
      issuer: "https://local.example",
    });
    cleanups.push(async () => {
      await auth.close();
      await storage.cleanup();
    });
    const tool = createAgentSetTrustLevelTool({
      entityService: service,
      auth: { get: () => auth },
    });
    const toolContext: ToolContext = {
      interfaceType: "test",
      actor: { kind: "user", userId: "owner" },
      userPermissionLevel: "admin",
    };

    const confirmation = await tool.handler(
      { agent: "trust.example", level: "public" },
      toolContext,
    );
    expectConfirmation(confirmation);
    expect(confirmation.summary).toBe(
      "Revoke inbound trusted A2A access from trust.example?",
    );
    const result = await tool.handler(
      confirmationArgs(confirmation),
      toolContext,
    );

    expectSuccess(result);
    expect(result.data).toEqual({ agent: "trust.example", level: "public" });
  });
});
