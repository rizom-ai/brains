import type { ContentVisibility } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export const summaryMemoryVisibilitySchema: z.ZodType<
  ContentVisibility,
  "public" | "shared" | "restricted" | "private" | undefined
> = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value): ContentVisibility => {
    if (value === undefined || value === "private") return "restricted";
    return value;
  });

export interface SummaryConfig {
  enableProjection: boolean;
  maxSourceMessages: number;
  maxMessagesPerChunk: number;
  projectionDelayMs: number;
  maxEntries: number;
  maxEntryLength: number;
  includeKeyPoints: boolean;
  projectionVersion: number;
  memoryVisibility: ContentVisibility;
}

export interface SummaryConfigInput {
  enableProjection?: boolean | undefined;
  maxSourceMessages?: number | undefined;
  maxMessagesPerChunk?: number | undefined;
  projectionDelayMs?: number | undefined;
  maxEntries?: number | undefined;
  maxEntryLength?: number | undefined;
  includeKeyPoints?: boolean | undefined;
  projectionVersion?: number | undefined;
  memoryVisibility?: "public" | "shared" | "restricted" | "private" | undefined;
}

export const summaryConfigSchema: z.ZodType<SummaryConfig, SummaryConfigInput> =
  z.object({
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
