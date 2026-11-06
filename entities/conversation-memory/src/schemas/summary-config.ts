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
  memoryVisibility: typeof summaryMemoryVisibilitySchema;
}> = z.object({
  memoryVisibility: summaryMemoryVisibilitySchema.describe(
    "Visibility applied to the memory the plugin writes: action items found in channels",
  ),
});

export type SummaryConfig = z.output<typeof summaryConfigSchema>;
export type SummaryConfigInput = z.input<typeof summaryConfigSchema>;
