import { describe, expect, it, spyOn } from "bun:test";
import { createClient } from "@libsql/client";
import {
  BatchJobManager,
  JobQueueService,
  JobQueueWorker,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestDatabase,
  waitUntil,
} from "@brains/test-utils";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { SdkError, type SdkErrorCode } from "@brains/contracts";
import {
  defineJob,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const secret = "private-token-and-request-body";

describe("declared job failure boundaries", () => {
  it("persists worker codes, exposes them to terminal hooks and reads them after reopening SQLite", async () => {
    const logger = createSilentLogger();
    const database = await createTestDatabase({
      prefix: "sdk-job-errors-",
      filename: "jobs.db",
      migrate: (url) => migrateJobQueue({ url }, logger),
    });
    let queue = JobQueueService.createFresh({ url: database.url }, logger);
    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    spyOn(shell, "getJobQueueService").mockImplementation(() => queue);
    spyOn(shell.jobs, "getStatus").mockImplementation((id) =>
      queue.getStatus(id),
    );
    let batches: BatchJobManager | undefined;
    let readBatch: (() => Promise<unknown>) | undefined;
    spyOn(shell.jobs, "getBatchStatus").mockImplementation(async (id) =>
      batches ? batches.getBatchStatus(id) : null,
    );
    const readers = new Map<string, () => Promise<unknown>>();
    const terminal: SdkErrorCode[] = [];
    const domainOutcomes: string[] = [];
    let domainExecutions = 0;
    let domainDefaults = 0;
    let executedValue: number | undefined;
    let settledValue: number | undefined;
    const input = z.object({ value: z.number().default(1) });
    const settled = async ({
      error,
    }: {
      error?: SdkError | undefined;
    }): Promise<void> => {
      if (error) terminal.push(error.code);
    };
    const bindings = [
      defineJob({
        name: "domain-refusal",
        input: z.object({ value: z.number().default(() => ++domainDefaults) }),
        output: z.object({
          success: z.literal(false),
          error: z.string(),
          code: z.literal("out_of_stock"),
        }),
        retry: { attempts: 1 },
      }).handle(
        async ({ input }) => {
          domainExecutions++;
          executedValue = input.value;
          return {
            success: false,
            error: "Inventory is empty",
            code: "out_of_stock",
          };
        },
        {
          settled: async ({ outcome, input }) => {
            domainOutcomes.push(outcome);
            settledValue = input.value;
          },
        },
      ),
      defineJob({
        name: "denied",
        input,
        output: z.string(),
        retry: { attempts: 1 },
      }).handle(
        async (): Promise<never> => {
          throw new SdkError("permission_denied", {
            message: secret,
            cause: new Error(secret),
          });
        },
        { settled },
      ),
      defineJob({
        name: "invalid-output",
        input,
        output: z.string().refine(() => false),
        retry: { attempts: 1 },
      }).handle(async () => secret, { settled }),
      defineJob({
        name: "invalid-input",
        input,
        output: z.string(),
        retry: { attempts: 1 },
      }).handle(async () => "never called", { settled }),
      defineJob({
        name: "invalid-json",
        input,
        output: z.string(),
        retry: { attempts: 1 },
      }).handle(async () => "never called", { settled }),
      defineJob({
        name: "deadline",
        input,
        output: z.string(),
        retry: { attempts: 1 },
        deadline: "10ms",
      }).handle(
        ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
        { settled },
      ),
    ];
    const definitions = bindings.map((binding) => binding.definition);
    const fixture = defineServicePlugin(
      {
        id: "errors",
        config: z.object({}),
        setup: ({ jobs }) => {
          readBatch = (): Promise<unknown> => jobs.batchStatus("all");
          return {};
        },
      },
      {
        jobs: () => bindings,
        tools: ({ jobs }) => [
          defineTool({
            name: "enqueue",
            description: "Queue a fixture",
            input: z.object({ name: z.string() }),
            output: z.string(),
            execute: async ({ input }) => {
              const definition = definitions.find(
                (entry) => entry.name === input.name,
              );
              if (!definition) throw new Error("Unknown fixture");
              const ref = await jobs.enqueue(definition, {});
              readers.set(ref.id, () => ref.status());
              return ref.id;
            },
          }),
        ],
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      fixture,
      {},
      { name: "@fixture/job-errors", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Plugin not instantiated");
    const progress: IJobProgressMonitor = {
      start: () => {},
      stop: () => {},
      createProgressReporter: () => createMockProgressReporter(),
      emitJobCompletion: async () => {},
      emitJobFailure: async () => {},
      handleJobStatusChange: async () => {},
    };
    const worker = JobQueueWorker.createFresh(queue, progress, logger, {
      pollInterval: 5,
    });
    try {
      await harness.installPlugin(plugin);
      const ids = new Map<string, string>();
      for (const definition of definitions) {
        const answer = await harness.executeTool("errors_enqueue", {
          name: definition.name,
        });
        const id = z
          .object({ success: z.literal(true), data: z.string() })
          .parse(answer).data;
        ids.set(definition.name, id);
      }
      // Batch coordination is in memory; re-register it when reopening the
      // queue so the aggregation reads the actual durable child rows.
      const registerBatch = async (): Promise<void> => {
        await batches?.stop();
        batches = BatchJobManager.createFresh(queue, logger);
        batches.registerBatch(
          "all",
          [...ids.values()],
          definitions.map((definition) => ({
            type: definition.name,
            data: {},
          })),
          plugin.id,
          { operationType: "batch_processing", rootJobId: "all" },
        );
      };
      const invalidInputId = ids.get("invalid-input");
      if (!invalidInputId) throw new Error("Input fixture was not queued");
      // An old/corrupt durable wire input is checked again by the worker.
      const sql = createClient({ url: database.url });
      try {
        await sql.execute({
          sql: "UPDATE job_queue SET data = ? WHERE id = ?",
          args: ['{"value":"bad"}', invalidInputId],
        });
        await sql.execute({
          sql: "UPDATE job_queue SET data = ? WHERE id = ?",
          args: ["{", ids.get("invalid-json") ?? ""],
        });
      } finally {
        sql.close();
      }
      await worker.start();
      await waitUntil(
        async () => {
          const statuses = await Promise.all(
            [...ids.values()].map((id) => queue.getStatus(id)),
          );
          return statuses.every(
            (status) =>
              status?.status === "failed" || status?.status === "completed",
          );
        },
        "all worker outcomes to become durable",
        { timeoutMs: 5000 },
      );
      await worker.stop();
      queue.close();
      queue = JobQueueService.createFresh({ url: database.url }, logger);
      await registerBatch();
      const batchStatus = await readBatch?.();
      expect(batchStatus).toMatchObject({
        total: 6,
        completed: 1,
        failed: 5,
        status: "failed",
        errors: [
          { code: "permission_denied" },
          { code: "invalid_response" },
          { code: "invalid_input" },
          { code: "invalid_input" },
          { code: "deadline_exceeded" },
        ],
      });
      expect(JSON.stringify(batchStatus)).not.toContain(secret);
      const expected = new Map<string, SdkErrorCode>([
        ["denied", "permission_denied"],
        ["invalid-output", "invalid_response"],
        ["invalid-input", "invalid_input"],
        ["invalid-json", "invalid_input"],
        ["deadline", "deadline_exceeded"],
      ]);
      for (const [name, id] of ids) {
        if (name === "domain-refusal") {
          expect(await queue.getStatus(id)).toMatchObject({
            status: "completed",
            retryCount: 0,
            lastErrorCode: null,
          });
          expect(await readers.get(id)?.()).toMatchObject({
            status: "completed",
            result: {
              success: false,
              error: "Inventory is empty",
              code: "out_of_stock",
            },
          });
          continue;
        }
        const code = expected.get(name);
        expect(await queue.getStatus(id)).toMatchObject({
          status: "failed",
          lastErrorCode: code,
        });
        const status = await readers.get(id)?.();
        expect(status).toMatchObject({ status: "failed", code });
        expect(JSON.stringify(status)).not.toContain(secret);
        expect(JSON.stringify(status)).not.toContain("stack");
      }
      expect(domainExecutions).toBe(1);
      expect(executedValue).toBeDefined();
      expect(settledValue).toBe(executedValue);
      expect(domainOutcomes).toEqual(["completed"]);
      // Typed terminal hooks require parsed input; corrupt wire data cannot
      // be passed to a callback promising the definition's parsed input type.
      expect(terminal.sort()).toEqual([
        "deadline_exceeded",
        "invalid_response",
        "permission_denied",
      ]);

      // Public readers must also sanitize pre-code rows and unknown future codes.
      queue.close();
      const oldRows = createClient({ url: database.url });
      try {
        await oldRows.execute({
          sql: "UPDATE job_queue SET lastError = ?, lastErrorCode = NULL WHERE id = ?",
          args: [null, invalidInputId],
        });
        await oldRows.execute({
          sql: "UPDATE job_queue SET lastError = ?, lastErrorCode = NULL WHERE id = ?",
          args: [secret, ids.get("invalid-output") ?? ""],
        });
        await oldRows.execute({
          sql: "UPDATE job_queue SET lastError = ?, lastErrorCode = ? WHERE id = ?",
          args: [secret, "future_code", ids.get("denied") ?? ""],
        });
      } finally {
        oldRows.close();
      }
      queue = JobQueueService.createFresh({ url: database.url }, logger);
      await registerBatch();
      expect(await readBatch?.()).toMatchObject({
        errors: [
          { code: "handler_failed", message: "The operation failed" },
          { code: "handler_failed", message: "The operation failed" },
          { code: "handler_failed", message: "The operation failed" },
          { code: "invalid_input" },
          { code: "deadline_exceeded" },
        ],
      });
      for (const id of [
        invalidInputId,
        ids.get("denied") ?? "",
        ids.get("invalid-output") ?? "",
      ]) {
        expect(await readers.get(id)?.()).toMatchObject({
          code: "handler_failed",
          error: "The operation failed",
        });
      }
    } finally {
      await batches?.stop();
      await worker.stop();
      await harness.reset();
      queue.close();
      await database.cleanup();
    }
  });
});
