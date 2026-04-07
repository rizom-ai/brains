import { createTemplate } from "@brains/templates";
import { AnswerContentSchema, type AnswerContent } from "./schema";
import { AnswerLayout } from "./layout";
import { AnswerFormatter } from "./formatter";

export {
  AnswerLayout,
  AnswerContentSchema,
  AnswerFormatter,
  type AnswerContent,
};

export const answerTemplate = createTemplate<AnswerContent>({
  name: "answer",
  description: "Rizom answer section — centered thesis statement",
  schema: AnswerContentSchema,
  formatter: new AnswerFormatter(),
  requiredPermission: "public",
  layout: { component: AnswerLayout },
});
