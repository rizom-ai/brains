import { formPackageDependencies } from "@brains/forms";
import { createQuizPackage } from "./plugin";

export { quizPluginConfigSchema } from "./config";
export type { QuizPluginConfig } from "./config";
export { createQuizPackage } from "./plugin";
export { quizResultEntity } from "./entity/quiz-result-entity";
export { quizResultTarget } from "./target";
export { quizResultAdapter } from "./entity/adapter";
export {
  quizResultFrontmatterSchema,
  quizResultMetadataSchema,
  quizResultSchema,
} from "./entity/schema";
export type {
  QuizResult,
  QuizResultFrontmatter,
  QuizResultMetadata,
} from "./entity/schema";

/** Quizzes with their results' type, as a brain composes them; no bundle
 * brings them. */
const quizPackage: ReturnType<typeof createQuizPackage> = createQuizPackage();
export default quizPackage;

/** The plugins the quiz service registers after, as its class declared. */
export const QUIZ_DEPENDENCIES: readonly string[] = Object.freeze(
  formPackageDependencies("quiz-result"),
);
