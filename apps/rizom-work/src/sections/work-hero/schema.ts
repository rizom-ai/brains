import { z } from "@brains/utils";

export const WorkHeroContentSchema = z.object({
  kicker: z.string(),
  /**
   * Headline text. `\n` becomes a line break; any `*...*` run renders
   * in italic accent — rizom.work's emphasis voice.
   */
  headline: z.string(),
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
