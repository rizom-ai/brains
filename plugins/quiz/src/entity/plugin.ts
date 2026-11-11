import {
  EntityPlugin,
  emptyEntityPluginConfigSchema,
  type EntityPluginContext,
  type EntityTypeConfig,
} from "@brains/plugins";
import packageJson from "../../package.json";
import { quizResultAdapter, type QuizResultAdapter } from "./adapter";
import { quizResultSchema, type QuizResult } from "./schema";

/** Entity half of quizzes. Installing it alone serves no quiz. */
export class QuizResultPlugin extends EntityPlugin<
  QuizResult,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "quiz-result" as const;
  readonly schema: typeof quizResultSchema = quizResultSchema;
  readonly adapter: QuizResultAdapter = quizResultAdapter;

  constructor() {
    super("quiz-result", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.entities.registerPersistValidator(
      this.entityType,
      async (entity) => {
        if (entity.visibility !== "restricted")
          throw new Error("Quiz results must have restricted visibility");
        quizResultAdapter.parseContent(entity.content);
      },
    );
  }
}
