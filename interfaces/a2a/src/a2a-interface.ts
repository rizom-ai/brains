import {
  InterfacePlugin,
  type InterfacePluginContext,
  type Tool,
  type WebRouteDefinition,
} from "@brains/plugins";
import type { Daemon, IAgentService } from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/templates";
import type { AgentCard } from "@a2a-js/sdk";
import { Hono } from "hono";
import { a2aConfigSchema, type A2AConfig } from "./config";
import { buildAgentCard } from "./agent-card";
import { skillDataSchema, type SkillData } from "@brains/plugins";
import { TaskManager } from "./task-manager";
import {
  handleJsonRpc,
  handleStreamMessage,
  jsonrpcRequestSchema,
  streamParamsSchema,
} from "./jsonrpc-handler";
import { createA2ACallTool } from "./client";
import packageJson from "../package.json";

const A2A_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * A2A Interface Plugin
 *
 * Implements the Agent-to-Agent protocol for inter-brain communication.
 * Serves an Agent Card for discovery and accepts tasks via JSON-RPC 2.0.
 * Routes tasks through AgentService (conversational, like Matrix/Discord).
 */
export class A2AInterface extends InterfacePlugin<A2AConfig> {
  declare protected config: A2AConfig;
  private agentCard: AgentCard | undefined;
  private unsubscribeReady: (() => void) | undefined;
  private unsubscribeSyncCompleted: (() => void) | undefined;
  private taskManager = new TaskManager();
  private agentService: IAgentService | undefined;
  private permissionContext: InterfacePluginContext["permissions"] | undefined;
  private app: Hono | undefined;
  private hasWebserver = false;

  constructor(config: Partial<A2AConfig> = {}) {
    super("a2a", packageJson, config, a2aConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    this.hasWebserver = context.plugins.has("webserver");
    this.agentService = context.agentService;
    this.permissionContext = context.permissions;

    // Build Agent Card after all plugins have registered
    // so we can see the full tool registry
    this.unsubscribeReady = context.messaging.subscribe(
      "system:plugins:ready",
      () => {
        void this.rebuildAgentCard(context);
        return { noop: true as const };
      },
    );

    // Rebuild after identity/profile services initialize.
    // Profile service loads from DB on sync:initial:completed (after plugins:ready),
    // so the first card build has "Unknown" as the anchor name.
    this.unsubscribeSyncCompleted = context.messaging.subscribe(
      "sync:initial:completed",
      () => {
        void this.rebuildAgentCard(context);
        return { success: true };
      },
    );

    if (this.hasWebserver) {
      this.logger.info("A2A interface registered", {
        domain: context.domain,
      });
    } else {
      this.logger.info("A2A interface registered in tool-only mode", {
        domain: context.domain,
      });
    }
  }

  /**
   * Rebuild the Agent Card from current brain identity and registered tools
   */
  private async rebuildAgentCard(
    context: InterfacePluginContext,
  ): Promise<void> {
    const character = context.identity.get();
    const profile = context.identity.getProfile();
    const tools = context.tools.listForPermissionLevel("public");

    const hasTrustedTokens =
      this.config.trustedTokens &&
      Object.keys(this.config.trustedTokens).length > 0;

    // Query skill entities for Agent Card — metadata validated via schema
    let skills: SkillData[] | undefined;
    if (context.entityService.hasEntityType("skill")) {
      try {
        const entities = await context.entityService.listEntities("skill");
        if (entities.length > 0) {
          skills = entities
            .map((e) => skillDataSchema.safeParse(e.metadata))
            .filter((r) => r.success)
            .map((r) => r.data);
        }
      } catch {
        // Skill entities not available — fall back to tools
      }
    }

    this.agentCard = buildAgentCard({
      character,
      profile,
      version: packageJson.version,
      domain: context.domain,
      organization: this.config.organization,
      tools,
      skills,
      authEnabled: hasTrustedTokens,
    });

    this.logger.debug("Agent Card rebuilt", {
      skills: this.agentCard.skills.length,
    });
  }

  /**
   * Get the current Agent Card
   */
  getAgentCard(): AgentCard | undefined {
    return this.agentCard;
  }

  /**
   * Resolve caller permission level from Authorization header.
   * Looks up bearer token in trustedTokens config, then checks
   * the permission system for the resolved identity.
   */
  private resolveCallerPermission(
    authHeader: string | undefined,
  ): UserPermissionLevel {
    if (!authHeader?.startsWith("Bearer ") || !this.config.trustedTokens) {
      return "public";
    }

    const token = authHeader.slice(7);
    const identity = this.config.trustedTokens[token];
    if (!identity || !this.permissionContext) {
      return "public";
    }

    return this.permissionContext.getUserLevel("a2a", identity);
  }

  private withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(A2A_CORS_HEADERS)) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  private getOrCreateApp(): Hono {
    if (this.app) {
      return this.app;
    }

    const app = new Hono();

    app.get("/.well-known/agent-card.json", (c) => {
      if (!this.agentCard) {
        return this.withCors(c.json({ error: "Agent Card not ready" }, 503));
      }
      return this.withCors(c.json(this.agentCard));
    });

    app.get("/a2a", (c) => {
      return this.withCors(
        c.json(
          {
            error: "Use POST with JSON-RPC 2.0 requests.",
            agentCard: "/.well-known/agent-card.json",
          },
          405,
        ),
      );
    });

    app.options("/a2a", () =>
      this.withCors(new Response(null, { status: 204 })),
    );

    app.post("/a2a", async (c) => {
      if (!this.agentService) {
        return this.withCors(
          c.json(
            {
              jsonrpc: "2.0",
              error: { code: -32603, message: "Agent service not ready" },
              id: null,
            },
            503,
          ),
        );
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return this.withCors(
          c.json({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
      }

      const parsed = jsonrpcRequestSchema.safeParse(body);
      if (!parsed.success) {
        return this.withCors(
          c.json({
            jsonrpc: "2.0",
            error: { code: -32600, message: "Invalid request" },
            id: null,
          }),
        );
      }

      const callerPermissionLevel = this.resolveCallerPermission(
        c.req.header("Authorization"),
      );

      if (parsed.data.method === "message/stream") {
        const streamParams = streamParamsSchema.safeParse(
          parsed.data.params ?? {},
        );

        if (!streamParams.success) {
          return this.withCors(
            c.json({
              jsonrpc: "2.0",
              error: {
                code: -32602,
                message: `Invalid params: ${streamParams.error.message}`,
              },
              id: parsed.data.id,
            }),
          );
        }

        const { stream } = handleStreamMessage(
          parsed.data.id,
          streamParams.data.message,
          {
            taskManager: this.taskManager,
            agentService: this.agentService,
            callerPermissionLevel,
          },
        );

        return this.withCors(
          new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }),
        );
      }

      const response = await handleJsonRpc(parsed.data, {
        taskManager: this.taskManager,
        agentService: this.agentService,
        callerPermissionLevel,
      });

      return this.withCors(c.json(response));
    });

    this.app = app;
    return app;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    if (!this.hasWebserver) {
      return [];
    }

    const handleSharedRoute = (request: Request): Promise<Response> =>
      Promise.resolve(this.getOrCreateApp().fetch(request));

    return [
      {
        path: "/.well-known/agent-card.json",
        method: "GET",
        public: true,
        handler: handleSharedRoute,
      },
      {
        path: "/a2a",
        method: "GET",
        public: true,
        handler: handleSharedRoute,
      },
      {
        path: "/a2a",
        method: "POST",
        public: true,
        handler: handleSharedRoute,
      },
      {
        path: "/a2a",
        method: "OPTIONS",
        public: true,
        handler: handleSharedRoute,
      },
    ];
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createA2ACallTool({
        outboundTokens: this.config.outboundTokens,
        entityService: this.getContext().entityService,
      }),
    ];
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Agent-to-agent calls
- Use \`a2a_call\` only for agents already saved in the local \`agent\` directory.
- Pass only the saved local agent id to \`a2a_call\` (for example \`yeehaa.io\`), never a full URL.
- If the user asks you to ask, message, or contact a saved active agent, call \`a2a_call\` in the same turn. Do not stop after listing the agent, drafting the question, or searching locally.
- If the user gives a full URL for an agent, do not call \`a2a_call\` yet. Tell the user to add that agent to the directory first.
- If the target agent is not in the directory, do not create a wish, reminder, todo, note, fallback task, or any new entity. Tell the user to add it first.
- Only use creation tools for an agent if the user explicitly asks you to add or save that agent.
- If the target agent is archived, do not call it and do not create a wish. Tell the user it must be unarchived first.`;
  }

  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        if (this.hasWebserver) {
          this.logger.info("A2A mounted on shared webserver host");
        } else {
          this.logger.info("A2A running without webserver routes");
        }
      },
      stop: async (): Promise<void> => {
        this.unsubscribeReady?.();
        this.unsubscribeSyncCompleted?.();
        this.logger.info("A2A server stopped");
      },
    };
  }
}
