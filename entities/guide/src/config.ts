import { docsChromeSchema } from "@brains/docs-chrome";
import { z } from "@brains/utils/zod";

/**
 * How the guide pages present themselves. Without a chrome they draw no
 * header or footer brand of their own, for a site whose layout brings its own.
 */
export const guidesConfigSchema: z.ZodObject<{
  chrome: z.ZodOptional<typeof docsChromeSchema>;
}> = z.object({
  chrome: docsChromeSchema.optional(),
});

export type GuidesConfig = z.output<typeof guidesConfigSchema>;
export type GuidesConfigInput = z.input<typeof guidesConfigSchema>;
