import { createTemplate } from "@brains/templates";
import { AnswerContentSchema, type AnswerContent } from "./schema";
import { AnswerLayout } from "./layout";
import { answerFormatter } from "./formatter";

export const answerTemplate = createTemplate<AnswerContent>({
  name: "answer",
  description: "Rizom answer section — centered thesis statement",
  schema: AnswerContentSchema,
  formatter: answerFormatter,
  requiredPermission: "public",
  layout: { component: AnswerLayout },
});
