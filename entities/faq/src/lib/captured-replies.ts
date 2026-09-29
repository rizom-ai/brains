import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

const capturedReplySchema: z.ZodObject<{ claimedAt: z.ZodString }> = z.object({
  claimedAt: z.string(),
});

export type CapturedReply = z.output<typeof capturedReplySchema>;
export type CapturedReplyStore = IRuntimeStateStore<CapturedReply>;

/**
 * Which chat replies a capture has already handled, keyed by message id.
 * Plugin state, not FAQ content: it only stops a retried or repeated job
 * from classifying or counting the same reply twice.
 */
export function capturedReplyStore(
  runtimeState: IRuntimeStateNamespace,
): CapturedReplyStore {
  return runtimeState.scoped({
    namespace: "faq.captured-replies",
    schema: capturedReplySchema,
  });
}
