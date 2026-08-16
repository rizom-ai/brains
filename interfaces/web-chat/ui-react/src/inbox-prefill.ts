import {
  webChatInboxPrefillStateSchema,
  type WebChatInboxContext,
} from "../../src/inbox-prefill-contract";

export interface InboxChatHandoff {
  text: string;
  context: WebChatInboxContext;
}

export function withoutInboxChatPrefill(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const { webChatPrefill: _prefill, ...remaining } = state;
  return remaining;
}

/** Consume a one-shot Inbox handoff without submitting it. */
export function consumeInboxChatPrefill(
  state: unknown,
  clear: () => void,
): InboxChatHandoff | undefined {
  const parsed = webChatInboxPrefillStateSchema.safeParse(state);
  if (!parsed.success) return undefined;
  clear();
  return {
    text: parsed.data.webChatPrefill.text,
    context: parsed.data.webChatPrefill.context,
  };
}
