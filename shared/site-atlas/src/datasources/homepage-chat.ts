import type {
  BaseDataSourceContext,
  IRuntimeStateNamespace,
} from "@brains/plugins";
import {
  ASK_BOX_STATE_KEY,
  ASK_BOX_STATE_NAMESPACE,
  askBoxAvailabilitySchema,
} from "@brains/contracts";

/**
 * Whether the homepage offers the guest chat box: Web Chat records in shared
 * runtime state whether it serves the public box boot (and on preview), so
 * site builds in a separate worker, where Web Chat is not registered, see it
 * too. Owner authorization is still decided at runtime; an unauthorized box
 * says so and the door stays.
 */
export async function homepageChatAvailable(
  context: Pick<BaseDataSourceContext, "publishedOnly">,
  runtime: { runtimeState: IRuntimeStateNamespace },
): Promise<boolean> {
  const preview = context.publishedOnly === false;
  try {
    const record = await runtime.runtimeState
      .scoped({
        namespace: ASK_BOX_STATE_NAMESPACE,
        schema: askBoxAvailabilitySchema,
      })
      .get(ASK_BOX_STATE_KEY);
    return record !== null && record.public && (!preview || record.preview);
  } catch {
    // An unreadable record cannot show that Web Chat serves the box; keep the door only.
    return false;
  }
}
