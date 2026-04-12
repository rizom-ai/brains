import { z } from "@brains/utils";

export const ResearchEssaySchema = z.object({
  num: z.string(),
  series: z.string(),
  title: z.string(),
  teaser: z.string(),
  href: z.string(),
});

export const ResearchContentSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  subhead: z.string(),
  essays: z.array(ResearchEssaySchema).min(1),
  ctaLabel: z.string(),
  ctaHref: z.string(),
});

export type ResearchEssay = z.infer<typeof ResearchEssaySchema>;
export type ResearchContent = z.infer<typeof ResearchContentSchema>;
