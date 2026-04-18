import { z } from "@brains/utils";

export const WorkProblemContentSchema = z.object({
  kicker: z.string(),
  /**
   * Headline text. `\n` becomes a line break; any `*...*` run renders
   * in italic accent — rizom.work's emphasis voice.
   */
  headline: z.string(),
  subhead: z.string(),
});

export type WorkProblemContent = z.infer<typeof WorkProblemContentSchema>;
