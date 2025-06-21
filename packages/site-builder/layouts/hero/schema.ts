import { z } from "zod";

export const HeroLayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  backgroundImage: z.string().optional(),
});

export type HeroLayoutProps = z.infer<typeof HeroLayoutSchema>;