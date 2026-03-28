import type {
  IAgentService,
  AgentResponse,
  ChatContext,
} from "@brains/ai-service";
import { z } from "@brains/utils";

const agentResponseSchema = z.object({
  text: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
  toolResults: z
    .array(
      z.object({
        toolName: z.string(),
        args: z.record(z.unknown()).optional(),
        jobId: z.string().optional(),
        data: z.unknown().optional(),
      }),
    )
    .optional(),
  pendingConfirmation: z
    .object({
      toolName: z.string(),
      description: z.string(),
      args: z.unknown(),
    })
    .optional(),
});

function parseAgentResponse(json: unknown): AgentResponse {
  const result = agentResponseSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Invalid response from remote agent: ${result.error.message}`,
    );
  }
  const p = result.data;
  const response: AgentResponse = { text: p.text, usage: p.usage };
  if (p.toolResults) {
    response.toolResults = p.toolResults.map((t) => ({
      toolName: t.toolName,
      ...(t.args && { args: t.args }),
      ...(t.jobId && { jobId: t.jobId }),
      ...(t.data !== undefined && { data: t.data }),
    }));
  }
  if (p.pendingConfirmation) {
    response.pendingConfirmation = {
      toolName: p.pendingConfirmation.toolName,
      description: p.pendingConfirmation.description,
      args: p.pendingConfirmation.args,
    };
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

    return parseAgentResponse(await response.json());
  }

  invalidateAgent(): void {
    // Remote agents manage their own state
  }

  static createFresh(config: RemoteAgentServiceConfig): RemoteAgentService {
    return new RemoteAgentService(config);
  }
}
