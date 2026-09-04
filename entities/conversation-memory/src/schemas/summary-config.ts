import type { ContentVisibility } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type MemoryVisibilityInput = ContentVisibility | "private" | undefined;

export const summaryMemoryVisibilitySchema: z.ZodPipe<
  z.ZodOptional<
    z.ZodUnion<
      readonly [
        z.ZodEnum<{
          public: "public";
          shared: "shared";
          restricted: "restricted";
        }>,
        z.ZodLiteral<"private">,
      ]
    >
  >,
  z.ZodTransform<ContentVisibility, MemoryVisibilityInput>
> = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value): ContentVisibility => {
    if (value === undefined || value === "private") return "restricted";
    return value;
  });

export const summaryConfigSchema: z.ZodObject<{
  maxSourceMessages: z.ZodDefault<z.ZodNumber>;
  maxMessagesPerChunk: z.ZodDefault<z.ZodNumber>;
  maxEntries: z.ZodDefault<z.ZodNumber>;
  maxEntryLength: z.ZodDefault<z.ZodNumber>;
  includeKeyPoints: z.ZodDefault<z.ZodBoolean>;
  projectionVersion: z.ZodDefault<z.ZodNumber>;
  memoryVisibility: typeof summaryMemoryVisibilitySchema;
}> = z.object({
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
