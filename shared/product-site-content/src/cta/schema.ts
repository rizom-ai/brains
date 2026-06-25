import { z } from "@brains/utils/zod-v4";

/**
 * Schema for CTA section
 */
export const ctaSectionSchema = z.object({
  headline: z.string(),
  description: z.string(),
  primaryButton: z.object({
    text: z.string(),
    link: z.string(),
  }),
  secondaryButton: z
    .object({
      text: z.string(),
      link: z.string(),
    })
    .optional(),
});

export type CTASection = z.output<typeof ctaSectionSchema>;
