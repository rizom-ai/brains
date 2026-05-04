import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AgentDiscoveryPlugin } from "../src/plugin";
import type { AgentEntity } from "../src/schemas/agent";

function makeAgentEntity(status: "discovered" | "approved") {
  return {
    id: "yeehaa.io",
    entityType: "agent" as const,
    content: `---
name: Yeehaa
kind: professional
brainName: Yeehaa
url: "https://yeehaa.io/a2a"
status: ${status}
discoveredAt: "2026-03-31T00:00:00.000Z"
---

# Agent

## About

A saved agent.

## Skills

- chat: Talks with users [conversation]

## Notes

`,
    metadata: {
      name: "Yeehaa",
      url: "https://yeehaa.io/a2a",
      status,
      slug: "yeehaa-io",
    },
    created: new Date("2026-03-31T00:00:00.000Z").toISOString(),
    updated: new Date("2026-03-31T00:00:00.000Z").toISOString(),
  };
}

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
    > =>
      ({
        ...origJobQueue,
        enqueue: async (request) => {
          const jobOptions = request.options;
          const dedupeKey =
            jobOptions?.deduplication === "coalesce"
              ? `${request.type}:${jobOptions.deduplicationKey ?? ""}`
              : undefined;

          let jobId: string;
          if (dedupeKey && coalescedJobs.has(dedupeKey)) {
            jobId = coalescedJobs.get(dedupeKey) as string;
          } else {
            jobId = await origJobQueue.enqueue(request);
            if (dedupeKey) {
              coalescedJobs.set(dedupeKey, jobId);
            }
          }

          enqueued.push({
            type: request.type,
            options: request.options,
            jobId,
          });
          return jobId;
        },
      }) as ReturnType<typeof mockShell.getJobQueueService>;

    await harness.installPlugin(plugin);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("agent");
    if (!interceptor) throw new Error("Expected agent create interceptor");

    const first = (await interceptor(
      {
        entityType: "agent",
        url: "https://yeehaa.io",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    )) as { result?: { data?: { jobId?: string } } };

    const second = (await interceptor(
      {
        entityType: "agent",
        url: "yeehaa.io",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    )) as { result?: { data?: { jobId?: string } } };

    expect(first.result?.data?.jobId).toBeDefined();
    expect(second.result?.data?.jobId).toBe(first.result?.data?.jobId);
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
