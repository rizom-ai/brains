import { messageRoleSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { Conversation, Message } from "./schema";
import type {
  AddConversationMessageRequest,
  GetMessagesOptions,
  IConversationService,
  ListConversationsOptions,
  StartConversationRequest,
  UpdateConversationMetadataRequest,
} from "./types";
import { messageSchema } from "./types";

export const CONVERSATION_RPC_SERVICE = "conversation";

export interface ConversationRpcTransport {
  initialize(): Promise<void>;
  request(
    payload: ConversationRpcRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  close(): void;
}

export type ConversationRpcRequest =
  | { operation: "startConversation"; request: StartConversationRequest }
  | { operation: "addMessage"; request: AddConversationMessageRequest }
  | {
      operation: "getMessages";
      conversationId: string;
      options?: GetMessagesOptions | undefined;
    }
  | { operation: "countMessages"; conversationId: string }
  | { operation: "getConversation"; conversationId: string }
  | {
      operation: "listConversations";
      options?: ListConversationsOptions | undefined;
    }
  | {
      operation: "updateConversationMetadata";
      request: UpdateConversationMetadataRequest;
    }
  | { operation: "deleteConversation"; conversationId: string }
  | {
      operation: "searchConversations";
      query: string;
      sessionId?: string | undefined;
    };

const conversationMetadataSchema = z.strictObject({
  channelName: z.string(),
  interfaceType: z.string(),
  channelId: z.string(),
});

const startConversationRequestSchema = z.strictObject({
  sessionId: z.string().min(1),
  interfaceType: z.string().min(1),
  channelId: z.string().min(1),
  personId: z.string().min(1).optional(),
  metadata: conversationMetadataSchema,
});

const addMessageRequestSchema = z.strictObject({
  conversationId: z.string().min(1),
  role: messageRoleSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const getMessagesOptionsSchema = z.strictObject({
  limit: z.number().int().nonnegative().optional(),
  range: z
    .strictObject({
      start: z.number().int().positive(),
      end: z.number().int().positive(),
    })
    .optional(),
});

const listConversationsOptionsSchema = z.strictObject({
  limit: z.number().int().nonnegative().optional(),
  updatedAfter: z.string().optional(),
  interfaceType: z.string().optional(),
  sessionId: z.string().optional(),
  channelId: z.string().optional(),
  personId: z.string().optional(),
});

const updateMetadataRequestSchema: z.ZodType<
  UpdateConversationMetadataRequest,
  unknown
> = z.strictObject({
  conversationId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
});

const conversationIdSchema = { conversationId: z.string().min(1) };

export const ConversationRpcRequestSchema: z.ZodType<
  ConversationRpcRequest,
  unknown
> = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("startConversation"),
    request: startConversationRequestSchema,
  }),
  z.strictObject({
    operation: z.literal("addMessage"),
    request: addMessageRequestSchema,
  }),
  z.strictObject({
    operation: z.literal("getMessages"),
    ...conversationIdSchema,
    options: getMessagesOptionsSchema.optional(),
  }),
  z.strictObject({
    operation: z.literal("countMessages"),
    ...conversationIdSchema,
  }),
  z.strictObject({
    operation: z.literal("getConversation"),
    ...conversationIdSchema,
  }),
  z.strictObject({
    operation: z.literal("listConversations"),
    options: listConversationsOptionsSchema.optional(),
  }),
  z.strictObject({
    operation: z.literal("updateConversationMetadata"),
    request: updateMetadataRequestSchema,
  }),
  z.strictObject({
    operation: z.literal("deleteConversation"),
    ...conversationIdSchema,
  }),
  z.strictObject({
    operation: z.literal("searchConversations"),
    query: z.string(),
    sessionId: z.string().optional(),
  }),
]);

const conversationSchema: z.ZodType<Conversation, unknown> = z.strictObject({
  id: z.string(),
  sessionId: z.string(),
  interfaceType: z.string(),
  channelId: z.string(),
  personId: z.string().nullable(),
  started: z.string(),
  lastActive: z.string(),
  metadata: z.string().nullable(),
  created: z.string(),
  updated: z.string(),
});

const messagesSchema: z.ZodType<Message[], unknown> = z.array(messageSchema);
const conversationsSchema: z.ZodType<Conversation[], unknown> =
  z.array(conversationSchema);

export function parseConversationRpcRequest(
  input: unknown,
): ConversationRpcRequest {
  return ConversationRpcRequestSchema.parse(input);
}

/**
 * What each operation answers. The schema map below is checked against this,
 * so the two cannot drift, and keying both by operation is what lets
 * `parseConversationRpcResult` return the operation's own type — callers no
 * longer re-assert it at the transport boundary.
 */
export interface ConversationRpcResults {
  startConversation: string;
  addMessage: undefined;
  getMessages: Message[];
  countMessages: number;
  getConversation: Conversation | null;
  listConversations: Conversation[];
  searchConversations: Conversation[];
  updateConversationMetadata: boolean;
  deleteConversation: boolean;
}

export type ConversationRpcOperation = keyof ConversationRpcResults;

const resultSchemas: {
  [Op in ConversationRpcOperation]: z.ZodType<
    ConversationRpcResults[Op],
    unknown
  >;
} = {
  startConversation: z.string().min(1),
  addMessage: z.undefined(),
  getMessages: messagesSchema,
  countMessages: z.number().int().nonnegative(),
  getConversation: conversationSchema.nullable(),
  listConversations: conversationsSchema,
  searchConversations: conversationsSchema,
  updateConversationMetadata: z.boolean(),
  deleteConversation: z.boolean(),
};

export function parseConversationRpcResult<Op extends ConversationRpcOperation>(
  request: { operation: Op },
  input: unknown,
): ConversationRpcResults[Op] {
  return resultSchemas[request.operation].parse(input);
}

/** Dispatch one validated request against the web-owned conversation service. */
export function handleConversationRpcRequest(
  service: IConversationService,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const request = parseConversationRpcRequest(input);
  switch (request.operation) {
    case "startConversation":
      return service.startConversation(request.request);
    case "addMessage":
      return service.addMessage(request.request);
    case "getMessages":
      return service.getMessages(request.conversationId, request.options);
    case "countMessages":
      return service.countMessages(request.conversationId);
    case "getConversation":
      return service.getConversation(request.conversationId);
    case "listConversations":
      return service.listConversations(request.options);
    case "updateConversationMetadata":
      return service.updateConversationMetadata(request.request);
    case "deleteConversation":
      return service.deleteConversation(request.conversationId);
    case "searchConversations":
      return service.searchConversations(request.query, request.sessionId);
  }
}
