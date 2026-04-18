import { z } from "@brains/utils";

export const MissionContentSchema = z.object({
  preamble: z.string(),
  /**
   * Headline text. `\n` becomes a line break; any `*...*` run renders
   * with the accent-highlight treatment. Matches rizom.ai's hero
   * convention so authors write one natural phrase instead of
   * splitting across structural fields.
   */
  headline: z.string(),
  post: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type MissionContent = z.infer<typeof MissionContentSchema>;
