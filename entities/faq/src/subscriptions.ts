import { ENTITY_CHANNELS } from "@brains/contracts";
import {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
  defineSubscription,
  UserPermissionLevelSchema,
  z,
  type AnySubscriptionDefinition,
  type ServiceJobs,
} from "@brains/sdk/services";
import { faqCaptureJob } from "./jobs/capture";
import { faqReconcileJob } from "./jobs/reconcile";

const assistantReply = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  role: z.literal("assistant"),
  position: z.number().int().positive(),
  metadata: z.object({ userPermissionLevel: UserPermissionLevelSchema }),
});
const guestReply = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  role: z.literal("assistant"),
  position: z.number().int().positive(),
});
const embeddingReady = z.object({
  entityType: z.string(),
  entityId: z.string(),
});

/** Events carry the committed position; no delayed transcript count or storage handle. */
export function faqSubscriptions(
  jobs: ServiceJobs,
): AnySubscriptionDefinition[] {
  return [
    defineSubscription({
      topic: ENTITY_CHANNELS.embeddingReady,
      execution: "all-roles",
      payload: z.unknown(),
      handle: async ({ payload }): Promise<void> => {
        const parsed = embeddingReady.safeParse(payload);
        if (parsed.success && parsed.data.entityType === "faq")
          await jobs.enqueue(faqReconcileJob, {
            entityId: parsed.data.entityId,
          });
      },
    }),
    defineSubscription({
      topic: CONVERSATION_MESSAGE_ADDED_CHANNEL,
      payload: z.unknown(),
      handle: async ({ payload }): Promise<void> => {
        const parsed = assistantReply.safeParse(payload);
        if (!parsed.success) return;
        const reply = parsed.data;
        await jobs.enqueue(faqCaptureJob, {
          conversationId: reply.conversationId,
          messageId: reply.messageId,
          position: reply.position,
          userPermissionLevel: reply.metadata.userPermissionLevel,
        });
      },
    }),
    defineSubscription({
      topic: CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
      payload: z.unknown(),
      handle: async ({ payload }): Promise<void> => {
        const parsed = guestReply.safeParse(payload);
        if (!parsed.success) return;
        const reply = parsed.data;
        await jobs.enqueue(faqCaptureJob, {
          conversationId: reply.conversationId,
          messageId: reply.messageId,
          position: reply.position,
          userPermissionLevel: "public",
        });
      },
    }),
  ];
}
