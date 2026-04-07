import { z } from "@brains/utils";

/**
 * Hero content for rizom sites.
 *
 * All fields are optional — variant-appropriate defaults live in the
 * layout component. Instances can override any field via
 * `brain-data/site-content/home/hero.md` (site-content plugin).
 */
export const HeroContentSchema = z.object({
  headline: z.string().optional(),
  subhead: z.string().optional(),
  primaryCtaLabel: z.string().optional(),
  primaryCtaHref: z.string().optional(),
  secondaryCtaLabel: z.string().optional(),
  secondaryCtaHref: z.string().optional(),
});

export type HeroContent = z.infer<typeof HeroContentSchema>;
