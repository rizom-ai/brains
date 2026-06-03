import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPluginHarness } from "@brains/plugins/test";
import { SwotAssessmentPlugin } from "../src";

describe("SwotAssessmentPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-swot-${randomUUID()}`,
    });
  });

  it("registers the swot entity type", async () => {
    const plugin = new SwotAssessmentPlugin();
    await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("swot");
  });

  it("registers deriveSwot eval handler", async () => {
    const plugin = new SwotAssessmentPlugin();
    const registrations: Array<{ pluginId: string; handlerId: string }> = [];
    const mockShell = harness.getMockShell();

    mockShell.registerEvalHandler = (pluginId, handlerId): void => {
      registrations.push({ pluginId, handlerId });
    };

    await harness.installPlugin(plugin);

    expect(registrations).toEqual([
      { pluginId: "swot", handlerId: "deriveSwot" },
    ]);
  });

  it("registers the standalone SWOT dashboard widget", async () => {
    const plugin = new SwotAssessmentPlugin();
    const registrations: Array<{ id: string; rendererName: string }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as { id: string; rendererName: string };
      registrations.push({
        id: payload.id,
        rendererName: payload.rendererName,
      });
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toEqual([{ id: "swot", rendererName: "SwotWidget" }]);
  });

  it("does not enqueue derivation before initial sync completes", async () => {
    const plugin = new SwotAssessmentPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: string[] = [];

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > =>
      ({
        ...origJobQueue,
        enqueue: async (request) => {
          enqueued.push(request.type);
          return origJobQueue.enqueue(request);
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
    const plugin = new SwotAssessmentPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: Array<{
      type: string;
      data: unknown;
      options: unknown;
      jobId: string;
    }> = [];

    const coalescedJobs = new Map<string, string>();
    let nextJobId = 0;

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > =>
      ({
        ...origJobQueue,
        enqueue: async (request) => {
          const dedupeKey = request.options?.deduplicationKey;
          const coalesceKey =
            request.options?.deduplication === "coalesce" && dedupeKey
              ? `${request.type}:${dedupeKey}`
              : undefined;
          const jobId = coalesceKey
            ? (coalescedJobs.get(coalesceKey) ?? `job-${++nextJobId}`)
            : `job-${++nextJobId}`;
          if (coalesceKey) {
            coalescedJobs.set(coalesceKey, jobId);
          }
          enqueued.push({
            type: request.type,
            data: request.data,
            options: request.options,
            jobId,
          });
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
    const plugin = new SwotAssessmentPlugin();
    const mockShell = harness.getMockShell();
    const origJobQueue = mockShell.getJobQueueService();
    const enqueued: Array<{ type: string; data: unknown }> = [];

    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > =>
      ({
        ...origJobQueue,
        enqueue: async (request) => {
          enqueued.push({ type: request.type, data: request.data });
          return origJobQueue.enqueue(request);
        },
      }) as ReturnType<typeof mockShell.getJobQueueService>;

    await harness.installPlugin(plugin);
    await harness.sendMessage("sync:initial:completed", {}, "directory-sync");

    expect(enqueued).toEqual([
      { type: "swot:derive", data: { reason: "initial-missing-entity" } },
    ]);
  });
});
