import { z } from "zod";
import type { Command, CommandResponse } from "../base/types";
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
      handler: async (_args, messageContext): Promise<string> => {
        if (!context) {
          return "Plugin context not initialized";
        }
        try {
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
                roomId: messageContext.channelId,
                interfaceId,
                userId: messageContext.userId,
              },
            },
          );
          return `Test job enqueued with ID: ${jobId}\nWatch the status bar for progress!`;
        } catch (error) {
          return `Failed to enqueue test job: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "test-batch",
      description: "Test batch progress tracking",
      usage: "/test-batch [count]",
      handler: async (args, messageContext): Promise<CommandResponse> => {
        if (!context) {
          return "Plugin context not initialized";
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
          const batchId = await context.enqueueBatch(
            operations,
            source,
            {
              roomId: messageContext.channelId,
              interfaceId,
              userId: messageContext.userId,
            },
            {
              priority: 5,
            },
          );

          return {
            type: "batch-operation" as const,
            batchId,
            message: `Batch operation enqueued with ID: ${batchId}\n${count} operations queued.`,
            operationCount: count,
          };
        } catch (error) {
          return `Failed to enqueue batch: ${error instanceof Error ? error.message : String(error)}`;
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
    process: async (data: TestBatchJobData) => {
      const duration = data.duration;
      await new Promise((resolve) => setTimeout(resolve, duration));
      return { success: true, item: data.item };
    },
    validateAndParse: (data: unknown): TestBatchJobData | null => {
      const parsed = testBatchJobSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
  });

  // Register test slow job handler
  context.registerJobHandler("test-slow-job", {
    process: async (data: TestSlowJobData) => {
      const duration = data.duration;
      const steps = 10;
      const stepDuration = duration / steps;

      for (let i = 0; i < steps; i++) {
        await new Promise((resolve) => setTimeout(resolve, stepDuration));
      }

      return { success: true, message: data.message ?? "Test completed!" };
    },
    validateAndParse: (data: unknown): TestSlowJobData | null => {
      const parsed = testSlowJobSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
  });
}
