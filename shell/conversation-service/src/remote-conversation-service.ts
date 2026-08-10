import type { Conversation, Message } from "./schema";
import type {
  AddConversationMessageRequest,
  GetMessagesOptions,
  IConversationService,
  ListConversationsOptions,
  StartConversationRequest,
  UpdateConversationMetadataRequest,
} from "./types";
import {
  parseConversationRpcResult,
  type ConversationRpcRequest,
  type ConversationRpcTransport,
} from "./conversation-rpc";

export class RemoteConversationService implements IConversationService {
  private readonly transport: ConversationRpcTransport;
  private closeRequested = false;

  public constructor(transport: ConversationRpcTransport) {
    this.transport = transport;
  }

  public initialize(): Promise<void> {
    if (this.closeRequested) return Promise.resolve();
    return this.transport.initialize();
  }

  public close(): void {
    if (this.closeRequested) return;
    this.closeRequested = true;
    this.transport.close();
  }

  private async requestRemote<T>(request: ConversationRpcRequest): Promise<T> {
    if (this.closeRequested) {
      throw new Error("Remote conversation service is closed");
    }
    const result = await this.transport.request(request);
    return parseConversationRpcResult(request, result) as T;
  }

  public startConversation(request: StartConversationRequest): Promise<string> {
    return this.requestRemote<string>({
      operation: "startConversation",
      request,
    });
  }

  public addMessage(request: AddConversationMessageRequest): Promise<void> {
    return this.requestRemote<void>({ operation: "addMessage", request });
  }

  public getMessages(
    conversationId: string,
    options?: GetMessagesOptions,
  ): Promise<Message[]> {
    return this.requestRemote<Message[]>({
      operation: "getMessages",
      conversationId,
      ...(options && { options }),
    });
  }

  public countMessages(conversationId: string): Promise<number> {
    return this.requestRemote<number>({
      operation: "countMessages",
      conversationId,
    });
  }

  public getConversation(conversationId: string): Promise<Conversation | null> {
    return this.requestRemote<Conversation | null>({
      operation: "getConversation",
      conversationId,
    });
  }

  public listConversations(
    options?: ListConversationsOptions,
  ): Promise<Conversation[]> {
    return this.requestRemote<Conversation[]>({
      operation: "listConversations",
      ...(options && { options }),
    });
  }

  public updateConversationMetadata(
    request: UpdateConversationMetadataRequest,
  ): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "updateConversationMetadata",
      request,
    });
  }

  public deleteConversation(conversationId: string): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "deleteConversation",
      conversationId,
    });
  }

  public searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]> {
    return this.requestRemote<Conversation[]>({
      operation: "searchConversations",
      query,
      ...(sessionId !== undefined && { sessionId }),
    });
  }
}
