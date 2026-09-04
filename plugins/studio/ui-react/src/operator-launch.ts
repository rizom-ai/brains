export interface StudioChatHandoff {
  readonly sourceId: string;
  readonly itemId: string;
  readonly label: string;
  readonly prompt: string;
}

interface StudioChatHandoffState {
  readonly studioChatHandoff: {
    readonly version: 1;
    readonly sourceId: string;
    readonly itemId: string;
    readonly label: string;
    readonly prompt: string;
  };
}

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

export function createStudioChatHandoffState(
  sourceId: string,
  itemId: string,
  label: string,
): StudioChatHandoffState {
  return {
    studioChatHandoff: {
      version: 1,
      sourceId,
      itemId,
      label,
      prompt: "Help me understand this Inbox item and decide what to do next.",
    },
  };
}

export function readStudioChatHandoffState(
  value: unknown,
): StudioChatHandoff | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = Reflect.get(value, "studioChatHandoff");
  if (typeof candidate !== "object" || candidate === null) return null;
  const version = Reflect.get(candidate, "version");
  const sourceId = Reflect.get(candidate, "sourceId");
  const itemId = Reflect.get(candidate, "itemId");
  const label = Reflect.get(candidate, "label");
  const prompt = Reflect.get(candidate, "prompt");
  if (
    version !== 1 ||
    typeof sourceId !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(sourceId) ||
    sourceId.length > 64 ||
    typeof itemId !== "string" ||
    itemId.trim().length === 0 ||
    itemId.length > 300 ||
    typeof label !== "string" ||
    label.trim().length === 0 ||
    label.length > 160 ||
    typeof prompt !== "string" ||
    prompt.trim().length === 0 ||
    prompt.length > 10_000
  ) {
    return null;
  }
  return {
    sourceId,
    itemId,
    label,
    prompt,
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
