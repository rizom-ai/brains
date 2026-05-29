import type {
  IAgentService,
  AgentResponse,
  ChatContext,
} from "@brains/ai-service";
import { AgentResponseSchema, toPublicAttachmentCard } from "@brains/plugins";

function parseAgentResponse(json: unknown): AgentResponse {
  const result = AgentResponseSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Invalid response from remote agent: ${result.error.message}`,
    );
  }

  const parsed = result.data;
  const response: AgentResponse = {
    text: parsed.text,
    usage: parsed.usage,
  };

  if (parsed.toolResults) {
    response.toolResults = parsed.toolResults.map((toolResult) => ({
      toolName: toolResult.toolName,
      ...(toolResult.args !== undefined ? { args: toolResult.args } : {}),
      ...(toolResult.jobId !== undefined ? { jobId: toolResult.jobId } : {}),
      ...(toolResult.data !== undefined ? { data: toolResult.data } : {}),
    }));
  }

  if (parsed.cards) {
    response.cards = parsed.cards.map((card) => {
      if (card.kind === "attachment") {
        return toPublicAttachmentCard(card);
      }

      return {
        kind: card.kind,
        id: card.id,
        ...(card.toolCallId !== undefined
          ? { toolCallId: card.toolCallId }
          : {}),
        toolName: card.toolName,
        ...(card.input !== undefined ? { input: card.input } : {}),
        summary: card.summary,
        ...(card.preview !== undefined ? { preview: card.preview } : {}),
        state: card.state,
        ...(card.output !== undefined ? { output: card.output } : {}),
        ...(card.error !== undefined ? { error: card.error } : {}),
      };
    });
  }

  if (parsed.pendingConfirmations) {
    response.pendingConfirmations = parsed.pendingConfirmations.map(
      (confirmation) => ({
        id: confirmation.id,
        ...(confirmation.toolCallId !== undefined
          ? { toolCallId: confirmation.toolCallId }
          : {}),
        toolName: confirmation.toolName,
        summary: confirmation.summary,
        ...(confirmation.preview !== undefined
          ? { preview: confirmation.preview }
          : {}),
        args: confirmation.args,
      }),
    );
  }

  return response;
}

export interface RemoteAgentServiceConfig {
  baseUrl: string;
  authToken?: string | undefined;
}

export class RemoteAgentService implements IAgentService {
  private readonly baseUrl: string;
  private readonly authToken?: string | undefined;

  constructor(config: RemoteAgentServiceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
  }

  async chat(
    message: string,
    conversationId: string,
    _context?: ChatContext,
  ): Promise<AgentResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Remote agent request failed: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    return parseAgentResponse(await response.json());
  }

  async confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
  ): Promise<AgentResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      },
      body: JSON.stringify({
        conversationId,
        confirmed,
        approvalId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Remote agent confirm failed: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    return parseAgentResponse(await response.json());
  }

  invalidateAgent(): void {
    // Remote agents manage their own state
  }

  static createFresh(config: RemoteAgentServiceConfig): RemoteAgentService {
    return new RemoteAgentService(config);
  }
}
