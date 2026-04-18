import { z } from "@brains/utils";

export const CloserContentSchema = z.object({
  preamble: z.string(),
  /**
   * Headline text. `\n` becomes a line break; any `*...*` run renders
   * in italic accent — matches rizom.work's hero emphasis voice.
   */
  headline: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type CloserContent = z.infer<typeof CloserContentSchema>;
