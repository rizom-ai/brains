import { z } from "@brains/utils";

/**
 * Hero content for rizom sites.
 *
 * All fields are optional — each variant provides sensible defaults in
 * the layout component. An instance can override any field via
 * `brain-data/site-content/home/hero.md` (site-content plugin) if it
 * wants a custom message.
 */
export const HeroContentSchema = z.object({
  eyebrow: z.string().optional(),
  headline: z.string().optional(),
  subhead: z.string().optional(),
  primaryCtaLabel: z.string().optional(),
  primaryCtaHref: z.string().optional(),
  secondaryCtaLabel: z.string().optional(),
  secondaryCtaHref: z.string().optional(),
});

export type HeroContent = z.infer<typeof HeroContentSchema>;
