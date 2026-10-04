import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { faq } from "./faq-entity";
import { faqConfigSchema } from "./schemas/config";
import { capturedReplyStore } from "./lib/captured-replies";
import { faqEvalHandlers } from "./lib/declared-evals";
import { handleFaqCapture } from "./jobs/capture";
import { handleFaqReconcile } from "./jobs/reconcile";
import { faqSubscriptions } from "./subscriptions";
import { faqInbox } from "./lib/faq-inbox-source";

/** Capture is the installed declaration identity used by durable FAQ receipts. */
export const faqPackage: ServicePackageDefinition<typeof faqConfigSchema> =
  defineServicePlugin(
    {
      id: "capture",
      config: faqConfigSchema,
      entities: [faq],
      setup: ({ runtimeState }) => ({
        replies: capturedReplyStore({ scoped: runtimeState }),
      }),
    },
    {
      inbox: () => faqInbox,
      jobs: ({ config, state }) => [
        handleFaqCapture({
          wasClaimed: (key) => state.replies.has(key),
          sameQuestionDistance: config.sameQuestionDistance,
        }),
        handleFaqReconcile(config.sameQuestionDistance),
      ],
      subscriptions: ({ config, jobs }) =>
        config.enabled ? faqSubscriptions(jobs) : [],
      evals: ({ config }) => faqEvalHandlers(config.sameQuestionDistance),
    },
  );

export default faqPackage;
