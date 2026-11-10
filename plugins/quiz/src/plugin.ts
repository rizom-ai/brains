import { FormPlugin } from "@brains/forms";
import packageJson from "../package.json";
import type { QuizPluginConfig } from "./config";
import type { QuizResult } from "./entity/schema";
import { quizResultTarget } from "./target";

/** Quizzes defined in the brain's content, on the forms engine; each one
 * taken is a `quiz-result` record. */
export class QuizPlugin extends FormPlugin<QuizResult> {
  constructor(config: QuizPluginConfig = {}) {
    super(
      {
        id: "quiz",
        packageJson,
        label: "Quiz",
        target: quizResultTarget,
        forms: [],
      },
      config,
    );
  }
}
