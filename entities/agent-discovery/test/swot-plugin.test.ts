import { beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SwotPlugin } from "../src";

describe("SwotPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-swot" });
  });

  it("registers the swot entity type", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("swot");
  });

  it("does not register a standalone dashboard widget", async () => {
    const plugin = new SwotPlugin();
    const registrations: string[] = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as { id: string };
      registrations.push(payload.id);
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toEqual([]);
  });

  it("does not enqueue derivation before initial sync completes", async () => {
    const plugin = new SwotPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: string[] = [];

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > =>
      ({
        ...origJobQueue,
        enqueue: async (type: string, data: unknown, options?: unknown) => {
          enqueued.push(type);
          return origJobQueue.enqueue(
            type,
            data,
            options as Parameters<typeof origJobQueue.enqueue>[2],
          );
        },
      }) as ReturnType<typeof mockShell.getJobQueueService>;

    await harness.installPlugin(plugin);
    await harness.sendMessage(
      "entity:created",
      { entityType: "agent" },
      "test",
    );

    expect(enqueued).toEqual([]);
  });

  it("coalesces first-run and follow-up derive requests through the job queue", async () => {
    const plugin = new SwotPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: Array<{
      type: string;
      data: unknown;
      options: unknown;
      jobId: string;
    }> = [];

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > =>
      ({
        ...origJobQueue,
        enqueue: async (type: string, data: unknown, options?: unknown) => {
          const jobId = await origJobQueue.enqueue(
            type,
            data,
            options as Parameters<typeof origJobQueue.enqueue>[2],
          );
          enqueued.push({ type, data, options, jobId });
          return jobId;
        },
      }) as ReturnType<typeof mockShell.getJobQueueService>;

    await harness.installPlugin(plugin);
    await harness.sendMessage("sync:initial:completed", {}, "directory-sync");
    await harness.sendMessage(
      "entity:updated",
      { entityType: "skill" },
      "test",
    );

    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]?.type).toBe("swot:derive");
    expect(enqueued[0]?.data).toEqual({ reason: "initial-missing-entity" });
    expect(enqueued[1]?.type).toBe("swot:derive");
    expect(enqueued[1]?.data).toEqual({ reason: "entity-change" });
    expect(enqueued[0]?.jobId).toBe(enqueued[1]?.jobId);
    expect(enqueued[0]?.options).toEqual(
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "swot",
      }),
    );
    expect(enqueued[1]?.options).toEqual(
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "swot",
      }),
    );
  });

  it("enqueues derive on initial sync when swot is missing", async () => {
    const plugin = new SwotPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: Array<{ type: string; data: unknown }> = [];

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > =>
      ({
        ...origJobQueue,
        enqueue: async (type: string, data: unknown, options?: unknown) => {
          enqueued.push({ type, data });
          return origJobQueue.enqueue(
            type,
            data,
            options as Parameters<typeof origJobQueue.enqueue>[2],
          );
        },
      }) as ReturnType<typeof mockShell.getJobQueueService>;

    await harness.installPlugin(plugin);
    await harness.sendMessage("sync:initial:completed", {}, "directory-sync");

    expect(enqueued).toEqual([
      { type: "swot:derive", data: { reason: "initial-missing-entity" } },
    ]);
  });
});
