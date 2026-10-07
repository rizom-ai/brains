import { inboundEmailSchema } from "@brains/contracts";
import type { IRuntimeStateStore } from "@brains/sdk/entities";
import { defineJob, z, type ServiceJobDefinition } from "@brains/sdk/services";
import {
  createMailClassifier,
  DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
  EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
} from "./lib/classifier";
import { EntityMailItemRepository } from "./mail-item-repository";
import type { MailThreadOrdinalCoordinator } from "./thread-ordinal-coordinator";
import { EmailTriageProcessor } from "./triage-processor";

const triageOutputSchema: z.ZodObject<{ acknowledged: z.ZodLiteral<true> }> =
  z.object({ acknowledged: z.literal(true) });

/**
 * One inbound email, classified into a mail item or discarded.
 *
 * The email interface hands the message over and advances its mailbox
 * cursor once the message is durably queued here; from then on the queue's
 * retries carry it. Three attempts, because the processor holds the first
 * two model failures and writes a safe fallback on the third.
 */
export const triageJob: ServiceJobDefinition<
  "triage",
  typeof inboundEmailSchema,
  typeof triageOutputSchema
> = defineJob({
  name: "triage",
  input: inboundEmailSchema,
  output: triageOutputSchema,
  retry: { attempts: 3 },
});

export interface TriageJobDependencies {
  readonly attempts: IRuntimeStateStore<number>;
  readonly threadOrdinals: MailThreadOrdinalCoordinator;
}

export function handleTriage(
  deps: TriageJobDependencies,
): ReturnType<typeof triageJob.handle> {
  return triageJob.handle(async ({ input, ai, entities, logger, prompts }) => {
    const rubric = await prompts.resolve(
      EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
      DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
    );
    const processor = new EmailTriageProcessor({
      repository: new EntityMailItemRepository(entities),
      threadOrdinals: {
        persist: (projection, writer): Promise<void> =>
          deps.threadOrdinals.persist(projection, writer, entities),
      },
      attempts: deps.attempts,
      classify: createMailClassifier(ai, rubric),
      logger,
    });
    const outcome = await processor.process(input);
    // A failed outcome is a failed job: the queue retries it, and the
    // processor's attempt state decides when to stop asking the model.
    if (!outcome.success) throw new Error(outcome.error);
    return { acknowledged: true };
  });
}
