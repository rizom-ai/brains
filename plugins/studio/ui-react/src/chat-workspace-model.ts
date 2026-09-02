import {
  chatMessageSchema,
  type ChatCard,
  type ChatHistoryMessage,
  type ChatMessage,
  type ChatProgressEvent,
  type ChatProtocolEvent,
  type ChatToolStatusEvent,
} from "@brains/contracts/chat";

interface StudioChatToolInput {
  toolCallId: string;
  toolName: string;
  input: unknown;
  title?: string | undefined;
}

export interface StudioChatApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown> | undefined;
  title?: string | undefined;
}

export interface StudioChatStreamState {
  messageId: string;
  text: string;
  cards: ChatCard[];
  approvals: StudioChatApproval[];
  progress: ChatProgressEvent[];
  statuses: ChatToolStatusEvent[];
  toolInputs: Readonly<Record<string, StudioChatToolInput>>;
  finished: boolean;
  error: string | null;
}

export function createStudioChatStreamState(): StudioChatStreamState {
  return {
    messageId: "assistant-stream",
    text: "",
    cards: [],
    approvals: [],
    progress: [],
    statuses: [],
    toolInputs: {},
    finished: false,
    error: null,
  };
}

/** Studio-owned assembly of raw server protocol facts into one visible turn. */
export function reduceStudioChatStream(
  state: StudioChatStreamState,
  event: ChatProtocolEvent,
): StudioChatStreamState {
  switch (event.type) {
    case "start":
      return event.messageId ? { ...state, messageId: event.messageId } : state;
    case "text-delta":
      return { ...state, text: `${state.text}${event.delta}` };
    case "tool-input-available":
      return {
        ...state,
        toolInputs: {
          ...state.toolInputs,
          [event.toolCallId]: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
            ...(event.title ? { title: event.title } : {}),
          },
        },
      };
    case "tool-approval-request": {
      const tool = state.toolInputs[event.toolCallId];
      const approval: StudioChatApproval = {
        approvalId: event.approvalId,
        toolCallId: event.toolCallId,
        toolName: tool?.toolName ?? "tool",
        ...(isRecord(tool?.input) ? { input: tool.input } : {}),
        ...(tool?.title ? { title: tool.title } : {}),
      };
      return {
        ...state,
        approvals: [
          ...state.approvals.filter(
            (item) => item.approvalId !== event.approvalId,
          ),
          approval,
        ],
      };
    }
    case "tool-output-available":
    case "tool-output-error":
    case "tool-output-denied":
      return {
        ...state,
        approvals: state.approvals.filter(
          (approval) => approval.toolCallId !== event.toolCallId,
        ),
      };
    case "data-progress":
      return { ...state, progress: [...state.progress, event.data] };
    case "data-status":
      return { ...state, statuses: [...state.statuses, event.data] };
    case "data-actions":
    case "data-sources":
    case "data-attachment":
      return { ...state, cards: [...state.cards, event.data] };
    case "finish":
      return { ...state, finished: true };
    case "abort":
      return {
        ...state,
        finished: true,
        error: event.reason ?? "Response stopped",
      };
    case "error":
      return { ...state, finished: true, error: event.errorText };
    default:
      return state;
  }
}

export function streamAssistantMessage(
  state: StudioChatStreamState,
): ChatHistoryMessage {
  return {
    id: state.messageId,
    role: "assistant",
    content: state.text,
    ...(state.cards.length > 0 ? { cards: state.cards } : {}),
  };
}

export function approvalResponseMessage(
  approval: StudioChatApproval,
  approved: boolean,
): ChatMessage {
  const response = {
    id: approval.approvalId,
    approved,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    ...(approval.input ? { input: approval.input } : {}),
    ...(approval.title ? { title: approval.title } : {}),
  };
  return chatMessageSchema.parse({
    role: "assistant",
    parts: [
      {
        state: "approval-responded",
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        ...(approval.input ? { input: approval.input } : {}),
        ...(approval.title ? { title: approval.title } : {}),
        approval: response,
      },
    ],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
