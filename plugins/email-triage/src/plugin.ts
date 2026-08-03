import { EMAIL_INBOUND, type InboundEmail } from "@brains/contracts";
import { ServicePlugin, type ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { createMailClassifier } from "./lib/classifier";
import { EntityMailItemRepository } from "./mail-item-repository";
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
  constructor(config: EmailTriageConfigInput = {}) {
    super("email-triage", packageJson, config, emailTriageConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
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
}
