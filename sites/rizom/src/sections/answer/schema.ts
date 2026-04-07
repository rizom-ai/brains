import { z } from "@brains/utils";

export const AnswerContentSchema = z.object({
  badge: z.string(),
  headline: z.string(),
  subhead: z.string(),
  scalesHeadline: z.string(),
  scalesSubhead: z.string(),
});

export type AnswerContent = z.infer<typeof AnswerContentSchema>;
