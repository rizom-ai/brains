import { z } from "@brains/utils";

export const HeroContentSchema = z.object({
  /**
   * Headline string. Any text wrapped in `*...*` renders with the
   * accent-highlight treatment (same mid-line decoration as the
   * Mission section's "work is play."), so the page opens and closes
   * in the same brand typographic voice.
   *
   * Example: `Build the agent that *represents you*`
   */
  headline: z.string(),
  subhead: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type HeroContent = z.infer<typeof HeroContentSchema>;
