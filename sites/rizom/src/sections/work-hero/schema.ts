import { z } from "@brains/utils";

export const WorkHeroContentSchema = z.object({
  kicker: z.string(),
  headlineStart: z.string(),
  headlineEmphasis: z.string(),
  headlineEnd: z.string(),
  subtitle: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
  diagnosticTitle: z.string(),
  diagnosticTag: z.string(),
  verdictLabel: z.string(),
  verdictValue: z.string(),
  findingsLabel: z.string(),
  findings: z.array(z.string()).length(3),
  diagnosticCtaLabel: z.string(),
  diagnosticCtaHref: z.string(),
});

export type WorkHeroContent = z.infer<typeof WorkHeroContentSchema>;
