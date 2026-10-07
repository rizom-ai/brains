import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/sdk/services";
import { z } from "@brains/utils/zod";

const capturedReplySchema: z.ZodObject<{ claimedAt: z.ZodString }> = z.object({
  claimedAt: z.string(),
});

export type CapturedReply = z.output<typeof capturedReplySchema>;
export type CapturedReplyStore = IRuntimeStateStore<CapturedReply>;

/**
 * Legacy reply claims, keyed by message id. A timestamp cannot establish
 * whether FAQ persistence finished. Preserve existing entries without replay;
 * new captures use entity-database mutation receipts instead of writing here.
 */
export function capturedReplyStore(
  runtimeState: IRuntimeStateNamespace,
): CapturedReplyStore {
  return runtimeState.scoped({
    namespace: "faq.captured-replies",
    schema: capturedReplySchema,
  });
}
