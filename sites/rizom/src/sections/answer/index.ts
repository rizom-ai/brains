import { createTemplate } from "@brains/templates";
import { AnswerContentSchema, type AnswerContent } from "./schema";
import { AnswerLayout } from "./layout";

export { AnswerLayout, AnswerContentSchema, type AnswerContent };

export const answerTemplate = createTemplate<AnswerContent>({
  name: "answer",
  description: "Rizom answer section — centered thesis statement",
  schema: AnswerContentSchema,
  requiredPermission: "public",
  layout: {
    component: AnswerLayout,
  },
});
