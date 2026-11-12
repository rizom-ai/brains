import { defineFormPackage } from "@brains/forms";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import type { quizPluginConfigSchema } from "./config";
import { quizResultEntity } from "./entity/quiz-result-entity";
import type { QuizResult } from "./entity/schema";
import { quizResultTarget } from "./target";

/** Quizzes defined in the brain's content, on the forms engine; each one
 * taken is a `quiz-result` record. */
export function createQuizPackage(): ServicePackageDefinition<
  typeof quizPluginConfigSchema
> {
  return defineFormPackage<QuizResult>({
    id: "quiz",
    label: "Quiz",
    entity: quizResultEntity,
    target: quizResultTarget,
    forms: [],
  });
}
