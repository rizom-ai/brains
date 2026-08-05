import { EMAIL_INBOUND, type InboundEmail } from "@brains/contracts";
import {
  ServicePlugin,
  type ServicePluginContext,
  type Tool,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { MailTriageInboxSource } from "./inbox-source";
import {
  createMailClassifier,
  DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
  EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
} from "./lib/classifier";
import { EntityMailItemRepository } from "./mail-item-repository";
import { registerEmailTriageCmsWorkspace } from "./operator-cms";
import { registerEmailTriageDashboardWidget } from "./operator-dashboard-widget";
import { MailTriageOperatorService } from "./operator-service";
import { createEmailTriageListTool } from "./operator-tool";
import {
  emailTriageConfigSchema,
  type EmailTriageConfig,
  type EmailTriageConfigInput,
} from "./schemas/config";
import { EmailTriageProcessor } from "./triage-processor";

export class EmailTriagePlugin extends ServicePlugin<
  EmailTriageConfig,
  EmailTriageConfigInput
> {
  private operator: MailTriageOperatorService | undefined;

  constructor() {
    super("email-triage", packageJson, {}, emailTriageConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.operator = new MailTriageOperatorService(context);
    context.inbox.registerSource(new MailTriageInboxSource(this.operator));
    const classificationPrompt = await context.prompts.resolve(
      EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
      DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
    );
    const processor = new EmailTriageProcessor({
      repository: new EntityMailItemRepository(context.entityService),
      attempts: context.runtimeState.scoped({
        namespace: "email-triage.classification-attempts",
        schema: z.number().int().min(1).max(3),
      }),
      classify: createMailClassifier(context.ai, classificationPrompt),
      logger: this.logger,
    });

    context.messaging.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) =>
      processor.process(message.payload),
    );
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const operator = this.getOperator();
    const workspaceUrl = await registerEmailTriageCmsWorkspace(
      context,
      operator,
    );
    await registerEmailTriageDashboardWidget(context, operator, workspaceUrl);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createEmailTriageListTool(this.getOperator())];
  }

  private getOperator(): MailTriageOperatorService {
    if (!this.operator) {
      throw new Error("Email triage operator service is not initialized");
    }
    return this.operator;
  }
}
