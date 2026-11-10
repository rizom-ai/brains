import type { QuizPluginConfig } from "./config";
import { QuizResultPlugin } from "./entity/plugin";
import { QuizPlugin } from "./plugin";

export { quizPluginConfigSchema } from "./config";
export type { QuizPluginConfig } from "./config";
export { QuizPlugin, QuizResultPlugin };
export { QuizInboxSource } from "./inbox-source";
export { quizResultTarget } from "./target";
export { QuizResultAdapter, quizResultAdapter } from "./entity/adapter";
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

/** Quizzes come with their results' type; no bundle brings them. */
export function quizPlugin(
  config: QuizPluginConfig = {},
): [QuizResultPlugin, QuizPlugin] {
  return [new QuizResultPlugin(), new QuizPlugin(config)];
}
