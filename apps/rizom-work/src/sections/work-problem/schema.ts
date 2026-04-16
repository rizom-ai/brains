import { z } from "@brains/utils";

export const WorkProblemContentSchema = z.object({
  kicker: z.string(),
  headlineStart: z.string(),
  headlineEmphasis: z.string(),
  headlineEnd: z.string(),
  subhead: z.string(),
});

export type WorkProblemContent = z.infer<typeof WorkProblemContentSchema>;
