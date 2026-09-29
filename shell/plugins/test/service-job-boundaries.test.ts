import { describe, expect, it } from "bun:test";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  defineInterface,
  defineMessageInterface,
  defineRoute,
  defineJob,
  instantiatePluginPackageDefinition,
  type ServiceJobs,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import { createBasePluginContext } from "../src/base/context";
import { createOperatorContext } from "../src/operator/operator-context-runtime";

describe("declared job boundaries", () => {
  it("preserves wire data and declared policies across service, interface, message and operator callers", async () => {
    const harness = createPluginHarness();
    const queue = harness.getMockShell().getJobQueueService();
    let terminalResult: { data: unknown } | undefined;
    const getStatus = harness.getMockShell().jobs.getStatus;
    harness.getMockShell().jobs.getStatus = async (
      id,
    ): ReturnType<typeof getStatus> => {
      const info = await getStatus(id);
      return info && terminalResult
        ? { ...info, status: "completed", result: terminalResult.data }
        : info;
    };
    const enqueues: Parameters<typeof queue.enqueue>[0][] = [];
    const enqueue = queue.enqueue.bind(queue);
    queue.enqueue = async (request): Promise<string> => {
      enqueues.push(request);
      return enqueue(request);
    };
    let parses = 0;
    let serviceJobs: ServiceJobs | undefined;
    const outcomes: unknown[] = [];
    const job = defineJob({
      name: "work",
      input: z.object({
        n: z.string().transform((value) => {
          parses++;
          return Number(value);
        }),
      }),
      output: z.object({ n: z.string().transform(Number) }),
      retry: { attempts: 5 },
      deadline: "1s",
      oncePending: ({ n }) => `once:${n}`,
    });
    const owner = defineServicePlugin(
      {
        id: "owner",
        config: z.object({}),
        setup: ({ jobs }) => {
          serviceJobs = jobs;
          return {};
        },
      },
      {
        jobs: () => [
          job.handle(async ({ input }) => ({ n: String(input.n + 1) }), {
            settled: async ({ input, outcome }) => {
              outcomes.push({ input, outcome });
            },
          }),
        ],
      },
    );
    const route = (
      enqueueJob: (input: { n: string }) => Promise<{ readonly id: string }>,
    ): ReturnType<typeof defineRoute> =>
      defineRoute({
        method: "POST",
        path: "/enqueue",
        security: { kind: "public" },
        body: z.object({ value: z.string() }),
        response: z.object({ id: z.string() }),
        handle: ({ body }) => enqueueJob({ n: body.value }),
      });
    const generic = defineInterface(
      { id: "generic", config: z.object({}) },
      { routes: ({ jobs }) => [route((input) => jobs.enqueue(job, input))] },
    );
    const message = defineMessageInterface(
      {
        id: "message",
        config: z.object({}),
        channel: {
          type: "audit",
          displayName: "Audit",
          subjectLabel: "Room",
          recipient: z.string(),
        },
      },
      {
        send: () => "unused",
        routes: ({ jobs }) => [route((input) => jobs.enqueue(job, input))],
      },
    );
    try {
      for (const definition of [owner, generic, message]) {
        for (const plugin of instantiatePluginPackageDefinition(
          definition,
          {},
          { name: "@fixture/jobs", version: "0.0.0" },
        )) {
          await harness.installPlugin(plugin);
          for (const mounted of plugin.getWebRoutes?.() ?? []) {
            const response = await mounted.handler(
              new Request("https://test.brain/enqueue", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ value: "7" }),
              }),
            );
            expect(response.status).toBe(200);
          }
        }
      }
      if (!serviceJobs) throw new Error("Owner was not installed");
      const reference = await serviceJobs.enqueue(job, { n: "7" });
      const operator = await createOperatorContext({
        config: {},
        state: {},
        provider: { caller: null, signal: new AbortController().signal },
        context: createBasePluginContext(harness.getMockShell(), "operator"),
      });
      await operator.jobs.enqueue(job, { n: "7" });
      expect(enqueues).toHaveLength(4);
      expect(parses).toBe(4);
      for (const request of enqueues) {
        expect(request).toMatchObject({
          type: "@fixture/jobs:owner:work",
          data: { n: "7" },
          options: {
            maxRetries: 4,
            deduplication: "skip",
            deduplicationKey: "once:7",
          },
        });
      }
      const handler = queue.getHandler("@fixture/jobs:owner:work");
      if (!handler) throw new Error("Handler was not registered");
      expect(handler.executionTimeoutMs).toBe(1000);
      const parsed = handler.validateAndParse({ n: "7" });
      const result = await handler.process(
        parsed,
        reference.id,
        createMockProgressReporter(),
        new AbortController().signal,
      );
      expect(parses).toBe(5);
      expect(result).toEqual({ n: "8" });
      await handler.onTerminalSuccess?.(
        parsed,
        reference.id,
        createMockProgressReporter(),
        new AbortController().signal,
      );
      expect(parses).toBe(5);
      expect(outcomes).toEqual([{ input: { n: 7 }, outcome: "completed" }]);
      terminalResult = { data: result };
      expect(await reference.status()).toMatchObject({ result: { n: 8 } });
      expect(await operator.jobs.status(job, reference.id)).toMatchObject({
        result: { n: 8 },
      });
    } finally {
      await harness.reset();
    }
  });
});
