import { EMAIL_INBOUND, type InboundEmail } from "@brains/contracts";
import {
  ServicePlugin,
  type ServicePluginContext,
  type Tool,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { createMailClassifier } from "./lib/classifier";
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

  constructor(config: EmailTriageConfigInput = {}) {
    super("email-triage", packageJson, config, emailTriageConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.operator = new MailTriageOperatorService(context);
    const processor = new EmailTriageProcessor({
      repository: new EntityMailItemRepository(context.entityService),
      attempts: context.runtimeState.scoped({
        namespace: "email-triage.classification-attempts",
        schema: z.number().int().min(1).max(3),
      }),
      classify: createMailClassifier(context.ai, this.config.instructions),
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
