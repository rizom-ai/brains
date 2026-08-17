import type {
  IAgentService,
  AgentResponse,
  ChatContext,
} from "@brains/ai-service";
import { parseAgentResponse as parseSharedAgentResponse } from "@brains/contracts";
import { Cause, Effect, Exit } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { getErrorMessage } from "@brains/utils/error";

function parseAgentResponse(json: unknown): AgentResponse {
  try {
    return parseSharedAgentResponse(json);
  } catch (error) {
    throw new Error(
      `Invalid response from remote agent: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }
}

export interface RemoteAgentServiceConfig {
  baseUrl: string;
  authToken?: string | undefined;
  /** HTTP timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number | undefined;
}

/** The one shape of fetch this service calls. */
export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface RemoteAgentServiceRuntimeOptions {
  clock?: Clock.Clock;
  /**
   * Injected so a test can answer requests without replacing globalThis.fetch.
   * Declared as the single call this service makes rather than `typeof fetch`,
   * whose overloads span Request, URL and string and cannot be satisfied by a
   * stand-in.
   */
  fetchImpl?: FetchImpl;
}

export class RemoteAgentService implements IAgentService {
  private readonly baseUrl: string;
  private readonly authToken?: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchImpl;
  private readonly clock: Clock.Clock | undefined;

  constructor(
    config: RemoteAgentServiceConfig,
    runtimeOptions?: RemoteAgentServiceRuntimeOptions,
  ) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.clock = runtimeOptions?.clock;
    this.fetchImpl = runtimeOptions?.fetchImpl ?? fetch;
  }

  async chat(
    message: string,
    conversationId: string,
    _context?: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    return this.request(
      "/api/agent/chat",
      { message, conversationId },
      "Remote agent request",
      signal,
    );
  }

  async confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
    _context: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    return this.request(
      "/api/agent/chat/confirm",
      { conversationId, confirmed, approvalId },
      "Remote agent confirm",
      signal,
    );
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
    operation: string,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    const request = Effect.tryPromise({
      try: async (requestSignal) => {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.authToken && {
              Authorization: `Bearer ${this.authToken}`,
            }),
          },
          body: JSON.stringify(body),
          signal: requestSignal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `${operation} failed: ${response.status} ${response.statusText} - ${errorBody}`,
          );
        }

        return parseAgentResponse(await response.json());
      },
      catch: (error) => error,
    }).pipe(
      Effect.timeoutFail({
        duration: this.timeoutMs,
        onTimeout: () =>
          new Error(`${operation} timed out after ${this.timeoutMs}ms`),
      }),
    );
    const timedRequest = this.clock
      ? Effect.withClock(request, this.clock)
      : request;
    const exit = await Effect.runPromiseExit(timedRequest, {
      ...(signal && { signal }),
    });

    if (Exit.isFailure(exit)) {
      if (signal?.aborted) throw signal.reason;
      throw Cause.squash(exit.cause);
    }
    return exit.value;
  }

  invalidateAgent(): void {
    // Remote agents manage their own state
  }

  static createFresh(config: RemoteAgentServiceConfig): RemoteAgentService {
    return new RemoteAgentService(config);
  }
}
