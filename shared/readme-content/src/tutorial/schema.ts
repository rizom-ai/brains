import { z } from "@brains/utils";

export const TutorialContentSchema = z.object({
  markdown: z.string(),
});

export type TutorialContent = z.infer<typeof TutorialContentSchema>;
