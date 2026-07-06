import { z } from "@brains/utils/zod";

/**
 * Schema for CTA section
 */
export interface CTAButton {
  text: string;
  link: string;
}

export interface CTASection {
  headline: string;
  description: string;
  primaryButton: CTAButton;
  secondaryButton?: CTAButton | undefined;
}

export const ctaSectionSchema: z.ZodType<CTASection> = z.object({
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
