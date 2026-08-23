interface InboxChatPrefillState {
  readonly webChatPrefill: {
    readonly version: 2;
    readonly text: string;
    readonly context: {
      readonly sourceId: string;
      readonly itemId: string;
      readonly label: string;
    };
  };
}

export function createInboxChatPrefillState(
  sourceId: string,
  itemId: string,
  label: string,
): InboxChatPrefillState {
  return {
    webChatPrefill: {
      version: 2,
      text: "Help me understand this Inbox item and decide what to do next.",
      context: { sourceId, itemId, label },
    },
  };
}
