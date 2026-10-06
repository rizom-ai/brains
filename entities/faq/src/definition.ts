import {
  defineServicePlugin,
  type ServicePackageDefinition,
  type ServiceCheckDeclaration,
} from "@brains/sdk/services";
import { faq } from "./faq-entity";
import { faqConfigSchema } from "./schemas/config";
import { capturedReplyStore } from "./lib/captured-replies";
import { faqEvalHandlers } from "./lib/declared-evals";
import { handleFaqCapture } from "./jobs/capture";
import { handleFaqReconcile } from "./jobs/reconcile";
import { faqSubscriptions } from "./subscriptions";
import { faqInbox } from "./lib/faq-inbox-source";
import {
  sourceWithdrawals,
  completeWithdrawal,
  resumeWithdrawals,
} from "./lib/source-withdrawals";
import { faqSourceReviewJob } from "./jobs/source-review-contract";
import {
  faqWithdrawalSubscription,
  askedBeforeSubscription,
} from "./subscriptions";

/** Capture is the installed declaration identity used by durable FAQ receipts. */
export const faqPackage: ServicePackageDefinition<typeof faqConfigSchema> =
  defineServicePlugin(
    {
      id: "capture",
      config: faqConfigSchema,
      entities: [faq],
      setup: ({ runtimeState, jobs }) => ({
        replies: capturedReplyStore({ scoped: runtimeState }),
        withdrawals: sourceWithdrawals({ scoped: runtimeState }),
        jobs,
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
        faqSourceReviewJob.handle(async (context) => ({
          reviewed: await completeWithdrawal(
            context.entities,
            state.withdrawals,
            context.input.sourceId,
            context.input.withdrawalId,
          ),
        })),
      ],
      checks: ({ state }) => [
        {
          id: "faq-source-withdrawals",
          cadence: "daily",
          deliverAlerts: false,
          includeInInbox: false,
          run: async ({
            signal,
          }): ReturnType<ServiceCheckDeclaration["run"]> => {
            await resumeWithdrawals(state.withdrawals, state.jobs, signal);
            return {};
          },
        },
      ],
      subscriptions: ({ config, state, jobs }) => [
        faqWithdrawalSubscription(state.withdrawals, jobs),
        ...(config.enabled
          ? [
              ...faqSubscriptions(jobs),
              askedBeforeSubscription(config.sameQuestionDistance),
            ]
          : []),
      ],
      evals: ({ config }) => faqEvalHandlers(config.sameQuestionDistance),
    },
  );

export default faqPackage;
