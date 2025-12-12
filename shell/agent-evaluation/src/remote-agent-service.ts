import type {
  IAgentService,
  AgentResponse,
  ChatContext,
} from "@brains/agent-service";

export interface RemoteAgentServiceConfig {
  /** Base URL of the remote brain (e.g., http://localhost:3333) */
  baseUrl: string;
  /** Optional auth token for protected endpoints */
  authToken?: string | undefined;
}

/**
 * Remote agent service that connects to a running brain via HTTP
 * Implements IAgentService for use with evaluation runner
 */
export class RemoteAgentService implements IAgentService {
  private readonly baseUrl: string;
  private readonly authToken?: string | undefined;

  constructor(config: RemoteAgentServiceConfig) {
    // Remove trailing slash if present
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
  }

  /**
   * Send a chat message to the remote agent
   */
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

    return response.json() as Promise<AgentResponse>;
  }

  /**
   * Confirm a pending action on the remote agent
   * Note: This is not commonly used in evaluations
   */
  async confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
  ): Promise<AgentResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      },
      body: JSON.stringify({ conversationId, confirmed }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Remote agent confirm failed: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    return response.json() as Promise<AgentResponse>;
  }

  /**
   * Create a fresh instance
   */
  static createFresh(config: RemoteAgentServiceConfig): RemoteAgentService {
    return new RemoteAgentService(config);
  }
}
