import {
  ServicePlugin,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { FormService } from "@brains/forms";
import packageJson from "../package.json";
import { quizPluginConfigSchema, type QuizPluginConfig } from "./config";
import type { QuizResult } from "./entity/schema";
import { QuizInboxSource } from "./inbox-source";
import { quizResultTarget } from "./target";

/** Quizzes defined in the brain's content, on the forms engine; each one
 * taken is a `quiz-result` record. */
export class QuizPlugin extends ServicePlugin<QuizPluginConfig, unknown> {
  readonly dependencies: string[];
  private readonly forms: FormService<QuizResult>;

  constructor(config: QuizPluginConfig = {}) {
    super("quiz", packageJson, config, quizPluginConfigSchema);
    this.dependencies = [
      "quiz-result",
      "notifications",
      "site-builder",
      "studio",
      "unified-inbox",
    ];
    this.forms = new FormService({
      label: "Quiz",
      target: quizResultTarget,
      forms: [],
      overrides: this.config.intake,
    });
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!context.executionOnly)
      context.inbox.registerSource(new QuizInboxSource(context));
    await this.forms.register(context, this.id);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.forms.webRoutes();
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.forms.ready(context);
  }

  protected override async onShutdown(): Promise<void> {
    await this.forms.shutdown();
  }
}
