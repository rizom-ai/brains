import { z } from "@brains/utils";

export const ProblemCardSchema = z.object({
  num: z.string(),
  title: z.string(),
  body: z.string(),
});

export const ProblemContentSchema = z.object({
  cards: z.array(ProblemCardSchema).length(3),
});

export type ProblemCard = z.infer<typeof ProblemCardSchema>;
export type ProblemContent = z.infer<typeof ProblemContentSchema>;
