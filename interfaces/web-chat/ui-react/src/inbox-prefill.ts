import { webChatInboxPrefillStateSchema } from "../../src/inbox-prefill-contract";

export function withoutInboxChatPrefill(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const { webChatPrefill: _prefill, ...remaining } = state;
  return remaining;
}

/** Consume a one-shot Inbox composer handoff without submitting it. */
export function consumeInboxChatPrefill(
  state: unknown,
  clear: () => void,
): string {
  const parsed = webChatInboxPrefillStateSchema.safeParse(state);
  if (!parsed.success) return "";
  clear();
  return parsed.data.webChatPrefill.text;
}
