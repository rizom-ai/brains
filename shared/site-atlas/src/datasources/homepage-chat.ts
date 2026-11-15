import { ASK_BOX_STATE_KEY, type AskBoxAvailability } from "@brains/contracts";

/** The shared record Web Chat keeps, as a data source reads it. */
export interface AskBoxReader {
  get(key: string): Promise<AskBoxAvailability | null>;
}

/**
 * Whether the homepage offers the guest chat box: Web Chat records in the
 * runtime state it shares (`askBoxAvailabilityState`) whether it serves the
 * public box boot (and on preview), so site builds in a separate worker,
 * where Web Chat is not registered, see it too. Owner authorization is still
 * decided at runtime; an unauthorized box says so and the door stays.
 */
export async function homepageChatAvailable(
  context: { readonly publishedOnly?: boolean | undefined },
  askBox: AskBoxReader,
): Promise<boolean> {
  const preview = context.publishedOnly === false;
  try {
    const record = await askBox.get(ASK_BOX_STATE_KEY);
    return record !== null && (preview ? record.preview : record.public);
  } catch {
    // An unreadable record cannot show that Web Chat serves the box; keep the door only.
    return false;
  }
}
