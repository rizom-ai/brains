import type { ContentVisibility } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export const summaryMemoryVisibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value): ContentVisibility => {
    if (value === undefined || value === "private") return "restricted";
    return value;
  });

export const summaryConfigSchema = z.object({
  enableProjection: z
    .boolean()
    .default(true)
    .describe("Project summaries from stored conversation messages"),
  maxSourceMessages: z
    .number()
    .int()
    .min(1)
    .default(1000)
    .describe("Maximum recent messages to load for one projection"),
  maxMessagesPerChunk: z
    .number()
    .int()
    .min(1)
    .default(40)
    .describe("Maximum messages sent to one summary extraction call"),
  projectionDelayMs: z
    .number()
    .int()
    .min(0)
    .default(90_000)
    .describe("Delay after the first new eligible message before projecting"),
  maxEntries: z
    .number()
    .int()
    .min(1)
    .default(50)
    .describe("Maximum summary entries per conversation"),
  maxEntryLength: z
    .number()
    .int()
    .min(100)
    .default(800)
    .describe("Target maximum length of each generated summary entry"),
  includeKeyPoints: z.boolean().default(true),
  projectionVersion: z.number().int().min(1).default(1),
  memoryVisibility: summaryMemoryVisibilitySchema.describe(
    "Visibility applied to projected summaries, decisions, and action items",
  ),
});

export type SummaryConfig = z.output<typeof summaryConfigSchema>;
export type SummaryConfigInput = z.input<typeof summaryConfigSchema>;
