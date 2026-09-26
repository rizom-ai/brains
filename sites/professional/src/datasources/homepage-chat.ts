import type {
  BaseDataSourceContext,
  InterfaceAvailabilityReader,
} from "@brains/plugins";
import { ASK_BOX_AVAILABILITY_OWNER } from "@brains/contracts";

/**
 * Whether the homepage offers the guest chat box: Web Chat records in shared
 * runtime state whether it serves the public box boot (and on preview), so
 * site builds in a separate worker, where Web Chat is not registered, see it
 * too. Owner authorization is still decided at runtime; an unauthorized box
 * says so and the door stays.
 */
export async function homepageChatAvailable(
  context: Pick<BaseDataSourceContext, "publishedOnly">,
  runtime: { interfaceAvailability: InterfaceAvailabilityReader },
): Promise<boolean> {
  const preview = context.publishedOnly === false;
  try {
    const record = await runtime.interfaceAvailability.get(
      ASK_BOX_AVAILABILITY_OWNER,
    );
    return record !== null && record.public && (!preview || record.preview);
  } catch {
    // An unreadable record cannot show that Web Chat serves the box; keep the door only.
    return false;
  }
}
