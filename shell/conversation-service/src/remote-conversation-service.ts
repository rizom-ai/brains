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
  type ConversationRpcResults,
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

  private async requestRemote<TRequest extends ConversationRpcRequest>(
    request: TRequest,
  ): Promise<ConversationRpcResults[TRequest["operation"]]> {
    if (this.closeRequested) {
      throw new Error("Remote conversation service is closed");
    }
    const result = await this.transport.request(request);
    return parseConversationRpcResult<TRequest["operation"]>(request, result);
  }

  public startConversation(request: StartConversationRequest): Promise<string> {
    return this.requestRemote({
      operation: "startConversation",
      request,
    });
  }

  public addMessage(request: AddConversationMessageRequest): Promise<void> {
    return this.requestRemote({ operation: "addMessage", request });
  }

  public getMessages(
    conversationId: string,
    options?: GetMessagesOptions,
  ): Promise<Message[]> {
    return this.requestRemote({
      operation: "getMessages",
      conversationId,
      ...(options && { options }),
    });
  }

  public countMessages(conversationId: string): Promise<number> {
    return this.requestRemote({
      operation: "countMessages",
      conversationId,
    });
  }

  public getConversation(conversationId: string): Promise<Conversation | null> {
    return this.requestRemote({
      operation: "getConversation",
      conversationId,
    });
  }

  public listConversations(
    options?: ListConversationsOptions,
  ): Promise<Conversation[]> {
    return this.requestRemote({
      operation: "listConversations",
      ...(options && { options }),
    });
  }

  public updateConversationMetadata(
    request: UpdateConversationMetadataRequest,
  ): Promise<boolean> {
    return this.requestRemote({
      operation: "updateConversationMetadata",
      request,
    });
  }

  public deleteConversation(conversationId: string): Promise<boolean> {
    return this.requestRemote({
      operation: "deleteConversation",
      conversationId,
    });
  }

  public searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]> {
    return this.requestRemote({
      operation: "searchConversations",
      query,
      ...(sessionId !== undefined && { sessionId }),
    });
  }
}
