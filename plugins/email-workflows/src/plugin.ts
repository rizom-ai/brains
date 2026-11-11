import { inboundEmailContract } from "@brains/contracts";
import { defineServicePlugin } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  serviceRuntime,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { mailItemEntity } from "./entity/mail-item-entity";
import { MailTriageInboxSource } from "./inbox-source";
import {
  createMailClassifier,
  DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
  EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
} from "./lib/classifier";
import { emailContextOf } from "./lib/email-context";
import { EntityMailItemRepository } from "./mail-item-repository";
import { MailTriageOperatorService } from "./operator-service";
import { createEmailTriageListTool } from "./operator-tool";
import { emailWorkflowsConfigSchema } from "./schemas/config";
import { EmailWorkflowsSourceReader } from "./source-read";
import {
  MailThreadOrdinalCoordinator,
  threadOrdinalStateSchema,
} from "./thread-ordinal-coordinator";
import { EmailTriageProcessor } from "./triage-processor";

/** What the package holds once set up. */
export interface EmailWorkflowsState {
  readonly operator: MailTriageOperatorService;
  readonly threadOrdinals: MailThreadOrdinalCoordinator;
}

/**
 * Email triage: inbound email classified into restricted mail items, the
 * Email Triage Inbox source, and the triage list tool. Only an
 * acknowledgement advances the mailbox cursor; a failure leaves the email
 * to be read again.
 */
export function createEmailWorkflowsPackage(): ServicePackageDefinition<
  typeof emailWorkflowsConfigSchema
> {
  const service = defineServicePlugin({
    id: "email-workflows",
    config: emailWorkflowsConfigSchema,
    entities: [mailItemEntity],
    setup: async (context): Promise<EmailWorkflowsState> => {
      const runtime = serviceRuntime(context);
      const email = emailContextOf(runtime);
      const operator = new MailTriageOperatorService(email);
      const threadOrdinals = new MailThreadOrdinalCoordinator({
        entityService: email.entityService,
        state: runtime.classRuntimeState.scoped({
          namespace: "email-workflows.thread-ordinals",
          schema: threadOrdinalStateSchema,
        }),
      });
      const sourceReader = new EmailWorkflowsSourceReader(runtime, operator);
      runtime.inboxSource(
        new MailTriageInboxSource(operator, threadOrdinals, sourceReader),
      );
      const classificationPrompt = await runtime.prompts.resolve(
        EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
        DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
      );
      const processor = new EmailTriageProcessor({
        repository: new EntityMailItemRepository(email.entityService),
        threadOrdinals,
        attempts: runtime.classRuntimeState.scoped({
          namespace: "email-workflows.classification-attempts",
          schema: z.number().int().min(1).max(3),
        }),
        classify: createMailClassifier(runtime.ai, classificationPrompt),
        logger: runtime.logger,
      });
      // Only an acknowledgement advances the mailbox cursor; a failure
      // leaves the email to be read again.
      runtime.answer(inboundEmailContract, async ({ request }) => {
        const outcome = await processor.process(request);
        if ("success" in outcome && outcome.success) return {};
        throw new Error(
          ("error" in outcome ? outcome.error : undefined) ??
            "Inbound email was not triaged",
        );
      });
      runtime.ready(async () => {
        if (!runtime.executionOnly) await threadOrdinals.initialize();
      });
      return { operator, threadOrdinals };
    },
  });
  return withTools<typeof emailWorkflowsConfigSchema, EmailWorkflowsState>(
    service,
    ({ state }) => [createEmailTriageListTool(state.operator)],
  );
}
