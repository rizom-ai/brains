import { z } from "@brains/utils";

export const FoundationHeroContentSchema = z.object({
  volumeLabel: z.string(),
  yearLabel: z.string(),
  metaLabel: z.string(),
  headline: z.string(),
  headlineTail: z.string(),
  tagline: z.string(),
  subtitle: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
  scrollLabel: z.string(),
  scrollHref: z.string(),
  colophon: z.array(z.string()).min(1),
});

export type FoundationHeroContent = z.infer<typeof FoundationHeroContentSchema>;
