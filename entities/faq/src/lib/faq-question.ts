import type { IEntityAINamespace } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";

/** Distance shortlists; only AI confirmation decides semantic equivalence. */
export const SAME_QUESTION_DISTANCE = 0.25;
export const SAME_QUESTION_CHECK =
  "Do these two FAQ entries ask the same question?";
const sameQuestionVerdictSchema = z.object({
  same: z
    .boolean()
    .describe(
      "True only when one answer serves anyone asking either question.",
    ),
});

export async function isSameQuestion(
  ai: Pick<IEntityAINamespace, "generateObject">,
  incoming: string,
  stored: string,
): Promise<boolean> {
  const { object } = await ai.generateObject(
    [
      SAME_QUESTION_CHECK,
      "Answer yes only when a single answer serves anyone asking either one.",
      "Questions about opposite or different actions are different questions, even when worded almost alike: publish vs unpublish, enable vs disable, add vs remove.",
      "",
      "New entry:",
      incoming,
      "",
      "Existing entry:",
      stored,
    ].join("\n"),
    sameQuestionVerdictSchema,
  );
  return object.same;
}
