import { z } from "@brains/utils";

export const CloserContentSchema = z.object({
  preamble: z.string(),
  headlineStart: z.string(),
  headlineEmphasis: z.string(),
  headlineEnd: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type CloserContent = z.infer<typeof CloserContentSchema>;
