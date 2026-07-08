import type {
  IAgentService,
  AgentResponse,
  ChatContext,
} from "@brains/ai-service";
import { parseAgentResponse as parseSharedAgentResponse } from "@brains/contracts";

function parseAgentResponse(json: unknown): AgentResponse {
  try {
    return parseSharedAgentResponse(json);
  } catch (error) {
    throw new Error(
      `Invalid response from remote agent: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
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
    const response = await fetch(`${this.baseUrl}/api/agent/chat`, {
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
    _context: ChatContext,
  ): Promise<AgentResponse> {
    const response = await fetch(`${this.baseUrl}/api/agent/chat/confirm`, {
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
