import { z } from "zod";
import type { Command, CommandResponse, JobResponse } from "../base/types";
import type { PluginContext } from "@brains/plugin-utils";

// Test job schemas
const testBatchJobSchema = z.object({
  duration: z.number().optional().default(1000),
  item: z.number().optional(),
});

const testSlowJobSchema = z.object({
  duration: z.number().optional().default(5000),
  message: z.string().optional(),
});

type TestBatchJobData = z.infer<typeof testBatchJobSchema>;
type TestSlowJobData = z.infer<typeof testSlowJobSchema>;

/**
 * Get test commands for progress tracking
 */
export function getTestCommands(
  interfaceId: string,
  context: PluginContext | undefined,
): Command[] {
  return [
    {
      name: "test-progress",
      description: "Test progress tracking with a slow job",
      handler: async (_args, messageContext): Promise<JobResponse> => {
        if (!context) {
          throw new Error("Plugin context not initialized");
        }

        const source = `${interfaceId}:${messageContext.channelId}`;
        const jobId = await context.enqueueJob(
          "test-slow-job",
          {
            duration: 10000,
            message: "Testing progress tracking",
          },
          {
            source,
            metadata: {
              interfaceId,
              userId: messageContext.userId,
              roomId: messageContext.channelId,
              operationType: "entity_processing",
              operationTarget: "test-slow-job",
            },
          },
        );

        return {
          type: "job-operation",
          jobId,
          message: `Test job enqueued with ID: ${jobId}\nWatch the status bar for progress!`,
        };
      },
    },
    {
      name: "test-batch",
      description: "Test batch progress tracking",
      usage: "/test-batch [count]",
      handler: async (args, messageContext): Promise<CommandResponse> => {
        if (!context) {
          return {
            type: "message",
            message: "Plugin context not initialized",
          };
        }
        try {
          const count = parseInt(args[0] ?? "5") || 5;
          const operations = Array.from({ length: count }, (_, i) => ({
            type: `${interfaceId}:test-batch-job`,
            entityId: `test-entity-${i}`,
            entityType: "test",
            options: {
              item: i + 1,
              duration: 1000 + i * 500,
            },
          }));
          const source = `${interfaceId}:${messageContext.channelId}`;
          const batchId = await context.enqueueBatch(operations, {
            source,
            metadata: {
              roomId: messageContext.channelId,
              interfaceId,
              userId: messageContext.userId,
              operationType: "batch_processing",
            },
            priority: 5,
          });

          return {
            type: "batch-operation" as const,
            batchId,
            message: `Batch operation enqueued with ID: ${batchId}\n${count} operations queued.`,
            operationCount: count,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Failed to enqueue batch: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}

/**
 * Register test job handlers
 */
export function registerTestJobHandlers(context: PluginContext): void {
  // Register test batch job handler
  context.registerJobHandler("test-batch-job", {
    process: async (
      data: TestBatchJobData,
      _jobId: string,
      progressReporter,
    ) => {
      const duration = data.duration;
      const steps = 5; // Simulate progress steps
      const stepDuration = duration / steps;

      for (let i = 0; i < steps; i++) {
        await progressReporter.report({
          message: `Processing item ${data.item} - step ${i + 1}/${steps}`,
          progress: i + 1,
          total: steps,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, stepDuration));
      }

      return { success: true, item: data.item };
    },
    validateAndParse: (data: unknown): TestBatchJobData | null => {
      const parsed = testBatchJobSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
  });

  // Register test slow job handler
  context.registerJobHandler("test-slow-job", {
    process: async (
      data: TestSlowJobData,
      _jobId: string,
      progressReporter,
    ) => {
      const duration = data.duration;
      const steps = 10;
      const stepDuration = duration / steps;

      for (let i = 0; i < steps; i++) {
        // Report progress
        await progressReporter.report({
          message: `Processing step ${i + 1} of ${steps}`,
          progress: i + 1,
          total: steps,
        });

        await new Promise<void>((resolve) => setTimeout(resolve, stepDuration));
      }

      return { success: true, message: data.message ?? "Test completed!" };
    },
    validateAndParse: (data: unknown): TestSlowJobData | null => {
      const parsed = testSlowJobSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
  });
}
