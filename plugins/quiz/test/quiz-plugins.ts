import type { Plugin } from "@brains/plugins";
import { quizPlugin } from "../src";
import type { QuizPluginConfig } from "../src/config";

/** The quiz package's plugins, as a brain installs them. */
export function createQuizPlugins(config: QuizPluginConfig = {}): Plugin[] {
  return quizPlugin(config);
}
