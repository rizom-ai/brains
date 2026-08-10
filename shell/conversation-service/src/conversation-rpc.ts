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
]) as z.ZodType<ConversationRpcRequest, unknown>;

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

function parseMessages(input: unknown): Message[] {
  return z.array(messageSchema).parse(input) as Message[];
}

function parseConversations(input: unknown): Conversation[] {
  return z.array(conversationSchema).parse(input);
}

export function parseConversationRpcRequest(
  input: unknown,
): ConversationRpcRequest {
  return ConversationRpcRequestSchema.parse(input);
}

export function parseConversationRpcResult(
  request: ConversationRpcRequest,
  input: unknown,
): unknown {
  switch (request.operation) {
    case "startConversation":
      return z.string().min(1).parse(input);
    case "addMessage":
      return z.undefined().parse(input);
    case "getMessages":
      return parseMessages(input);
    case "countMessages":
      return z.number().int().nonnegative().parse(input);
    case "getConversation":
      return input === null ? null : conversationSchema.parse(input);
    case "listConversations":
    case "searchConversations":
      return parseConversations(input);
    case "updateConversationMetadata":
    case "deleteConversation":
      return z.boolean().parse(input);
  }
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
