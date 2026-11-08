import { z } from "@brains/utils/zod";

/** How much reasoning a brain's model spends per turn. */
export const reasoningEffortSchema: z.ZodEnum<{
  none: "none";
  low: "low";
  medium: "medium";
  high: "high";
  xhigh: "xhigh";
  max: "max";
}> = z.enum(["none", "low", "medium", "high", "xhigh", "max"]);
export type ReasoningEffort = z.output<typeof reasoningEffortSchema>;
