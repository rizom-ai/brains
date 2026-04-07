import { z } from "@brains/utils";

export const HeroContentSchema = z.object({
  headline: z.string(),
  subhead: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type HeroContent = z.infer<typeof HeroContentSchema>;
