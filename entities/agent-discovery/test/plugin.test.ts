import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_DISCOVERED,
} from "@brains/atproto-contracts";
import { z } from "@brains/utils";
import { AgentDiscoveryPlugin } from "../src/plugins/agent-plugin";
import type { AgentEntity, AgentStatus } from "../src/schemas/agent";
import { createTestAgent } from "./fixtures/agent";

const handledJobResultSchema = z.object({
  kind: z.literal("handled"),
  result: z.object({
    data: z.object({
      jobId: z.string(),
    }),
  }),
});

function makeAgentEntity(status: AgentStatus): AgentEntity {
  return createTestAgent({
    id: "yeehaa.io",
    name: "Yeehaa",
    brainName: "Yeehaa",
    url: "https://yeehaa.io/a2a",
    status,
    about: "A saved agent.",
  });
}

const testBrainCardPayload = {
  repoDid: "did:plc:peer",
  uri: "at://did:plc:peer/ai.rizom.brain.card/self",
  cid: "bafy-peer-card",
  record: {
    $type: "ai.rizom.brain.card" as const,
    siteUrl: "https://peer.example.com",
    brain: {
      did: "did:web:peer.example.com",
      name: "Peer Brain",
      role: "assistant",
      purpose: "A peer brain discovered through ATProto.",
      values: ["collaboration"],
    },
    anchor: {
      did: "did:plc:anchor",
      name: "Peer Owner",
      kind: "professional",
    },
    model: "ranger",
    version: "0.2.0-test",
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
    createdAt: "2026-06-02T12:00:00.000Z",
    updatedAt: "2026-06-02T12:30:00.000Z",
  },
};

describe("AgentDiscoveryPlugin", () => {
  it("should not auto-create agents from a2a call completion events", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "a2a:call:completed",
      { domain: "yeehaa.io" },
      "a2a",
    );

    const agent = await harness.getEntityService().getEntity({
      entityType: "agent",
      id: "yeehaa.io",
    });
    expect(agent).toBeNull();

    harness.reset();
  });

  it("should treat explicit agent saves as approved generation jobs", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("agent");
    if (!interceptor) throw new Error("Expected agent create interceptor");

    const result = await interceptor(
      {
        entityType: "agent",
        url: "https://yeehaa.io",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { status: "generating" },
      },
    });

    harness.reset();
  });

  it("coalesces repeated explicit saves for the same domain and disables retries", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: Array<{
      type: string;
      options: unknown;
      jobId: string;
    }> = [];
    const coalescedJobs = new Map<string, string>();

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > => {
      const jobQueue: ReturnType<typeof mockShell.getJobQueueService> = {
        ...origJobQueue,
        enqueue: async (request) => {
          const jobOptions = request.options;
          const dedupeKey =
            jobOptions?.deduplication === "coalesce"
              ? `${request.type}:${jobOptions.deduplicationKey ?? ""}`
              : undefined;
          const existingJobId = dedupeKey
            ? coalescedJobs.get(dedupeKey)
            : undefined;

          const jobId = existingJobId ?? (await origJobQueue.enqueue(request));
          if (dedupeKey && !existingJobId) {
            coalescedJobs.set(dedupeKey, jobId);
          }

          enqueued.push({
            type: request.type,
            options: request.options,
            jobId,
          });
          return jobId;
        },
      };
      return jobQueue;
    };

    await harness.installPlugin(plugin);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("agent");
    if (!interceptor) throw new Error("Expected agent create interceptor");

    const first = handledJobResultSchema.parse(
      await interceptor(
        {
          entityType: "agent",
          url: "https://yeehaa.io",
        },
        {
          interfaceType: "test",
          userId: "test-user",
        },
      ),
    );

    const second = handledJobResultSchema.parse(
      await interceptor(
        {
          entityType: "agent",
          url: "yeehaa.io",
        },
        {
          interfaceType: "test",
          userId: "test-user",
        },
      ),
    );

    expect(first.result.data.jobId).toBeDefined();
    expect(second.result.data.jobId).toBe(first.result.data.jobId);
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]?.type).toBe("agent:generation");
    expect(enqueued[0]?.options).toEqual(
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "yeehaa.io",
        maxRetries: 0,
      }),
    );
    expect(enqueued[1]?.options).toEqual(
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "yeehaa.io",
        maxRetries: 0,
      }),
    );

    harness.reset();
  });

  it("should treat re-saving an existing approved agent as idempotent", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);
    await harness
      .getEntityService()
      .createEntity({ entity: makeAgentEntity("approved") });

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("agent");
    if (!interceptor) throw new Error("Expected agent create interceptor");

    const result = await interceptor(
      {
        entityType: "agent",
        url: "https://yeehaa.io",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { status: "created", entityId: "yeehaa.io" },
      },
    });

    const entities = await harness.getEntityService().listEntities({
      entityType: "agent",
    });
    expect(entities).toHaveLength(1);

    harness.reset();
  });

  it("should approve an existing discovered agent instead of enqueueing a duplicate create", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);
    await harness
      .getEntityService()
      .createEntity({ entity: makeAgentEntity("discovered") });

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("agent");
    if (!interceptor) throw new Error("Expected agent create interceptor");

    const result = await interceptor(
      {
        entityType: "agent",
        url: "https://yeehaa.io",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { status: "created", entityId: "yeehaa.io" },
      },
    });

    const updated = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "yeehaa.io",
    });
    expect(updated?.metadata.status).toBe("approved");
    // Content is derived from metadata on write via AgentAdapter.toMarkdown
    // (covered in agent-adapter.test.ts). The mock entityService stores
    // content verbatim, so asserting on content here would test the mock.

    harness.reset();
  });

  it("creates a discovered agent from an ATProto brain card event", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const events: unknown[] = [];

    harness.subscribe(ATPROTO_BRAIN_DISCOVERED, async (message) => {
      events.push(message.payload);
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );

    const agent = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(agent?.metadata.status).toBe("discovered");
    expect(agent?.metadata.url).toBe("https://peer.example.com");
    expect(agent?.metadata.name).toBe("Peer Owner");
    expect(agent?.metadata.repoDid).toBe("did:plc:peer");
    expect(agent?.metadata.brainDid).toBe("did:web:peer.example.com");
    expect(agent?.metadata.anchorDid).toBe("did:plc:anchor");
    expect(agent?.metadata.cardUri).toBe(testBrainCardPayload.uri);
    expect(agent?.metadata.a2aEndpoint).toBeUndefined();
    expect(agent?.content).toContain("Research");
    expect(events).toEqual([
      expect.objectContaining({
        agentId: "peer.example.com",
        status: "discovered",
        brainDid: "did:web:peer.example.com",
        anchorDid: "did:plc:anchor",
        cardUri: testBrainCardPayload.uri,
      }),
    ]);

    harness.reset();
  });

  it("enriches an approved agent from an ATProto brain card without downgrading it", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const events: unknown[] = [];

    harness.subscribe(ATPROTO_BRAIN_CARD_REFRESHED, async (message) => {
      events.push(message.payload);
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "peer.example.com",
        name: "Peer Brain",
        brainName: "Peer Brain",
        url: "https://peer.example.com",
        status: "approved",
      }),
    });

    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );

    const agent = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(agent?.metadata.status).toBe("approved");
    expect(agent?.metadata.repoDid).toBe("did:plc:peer");
    expect(agent?.metadata.brainDid).toBe("did:web:peer.example.com");
    expect(agent?.metadata.anchorDid).toBe("did:plc:anchor");
    expect(agent?.metadata.cardCid).toBe("bafy-peer-card");
    expect(events).toEqual([
      expect.objectContaining({
        agentId: "peer.example.com",
        status: "approved",
        brainDid: "did:web:peer.example.com",
        anchorDid: "did:plc:anchor",
        cardUri: testBrainCardPayload.uri,
      }),
    ]);

    harness.reset();
  });

  it("should register dashboard widgets on plugins ready", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const registrations: Array<{
      id: string;
      rendererName: string;
      hasComponent: boolean;
      hasClientScript: boolean;
    }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as {
        id: string;
        rendererName: string;
        component?: unknown;
        clientScript?: unknown;
      };
      registrations.push({
        id: payload.id,
        rendererName: payload.rendererName,
        hasComponent: typeof payload.component === "function",
        hasClientScript: typeof payload.clientScript === "string",
      });
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toEqual([
      {
        id: "agent-network",
        rendererName: "AgentNetworkWidget",
        hasComponent: true,
        hasClientScript: true,
      },
    ]);

    harness.reset();
  });
});
