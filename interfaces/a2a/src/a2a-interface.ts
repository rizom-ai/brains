import { getActiveAuthService } from "@brains/auth-service";
import {
  JwksResolver,
  signRequest,
  verifyRequest,
} from "@brains/http-signatures";
import {
  InterfacePlugin,
  type InterfacePluginContext,
  type Tool,
  type WebRouteDefinition,
} from "@brains/plugins";
import type { Daemon, AgentNamespace } from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/templates";
import type { AgentCard } from "@a2a-js/sdk";
import { Hono } from "hono";
import { a2aConfigSchema, type A2AConfig, type A2AConfigInput } from "./config";
import { buildAgentCard } from "./agent-card";
import { skillDataSchema, type SkillData } from "@brains/plugins";
import { TaskManager } from "./task-manager";
import {
  handleJsonRpc,
  handleStreamMessage,
  jsonrpcRequestSchema,
  streamParamsSchema,
} from "./jsonrpc-handler";
import { createAgentCallTool, type A2ARequestSigner } from "./client";
import packageJson from "../package.json";

const A2A_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Signature, Signature-Input, Content-Digest, Date",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * A2A Interface Plugin
 *
 * Implements the Agent-to-Agent protocol for inter-brain communication.
 * Serves an Agent Card for discovery and accepts tasks via JSON-RPC 2.0.
 * Routes tasks through AgentService (conversational, like Matrix/Discord).
 */
export class A2AInterface extends InterfacePlugin<A2AConfig, A2AConfigInput> {
  declare protected config: A2AConfig;
  private agentCard: AgentCard | undefined;
  private taskManager = new TaskManager();
  private agentService: AgentNamespace | undefined;
  private readonly jwksResolver = new JwksResolver();
  private app: Hono | undefined;
  private hasWebserver = false;

  constructor(config: A2AConfigInput = {}) {
    if (Object.prototype.hasOwnProperty.call(config, "trustedTokens")) {
      throw new Error("trustedTokens legacy config is no longer supported");
    }
    if (Object.prototype.hasOwnProperty.call(config, "outboundTokens")) {
      throw new Error("outboundTokens legacy config is no longer supported");
    }
    super("a2a", packageJson, config, a2aConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    this.hasWebserver = context.plugins.has("webserver");
    this.agentService = context.agent;

    if (this.hasWebserver) {
      context.endpoints.register({
        label: "A2A",
        url: "/a2a",
        priority: 25,
      });
      context.interactions.register({
        id: "a2a",
        label: "A2A",
        description: "Let other agents discover and talk to this brain.",
        href: "/a2a",
        kind: "agent",
        priority: 25,
      });
      this.logger.info("A2A interface registered", {
        domain: context.domain,
      });
    } else {
      this.logger.info("A2A interface registered in tool-only mode", {
        domain: context.domain,
      });
    }
  }

  protected override async onReady(
    context: InterfacePluginContext,
  ): Promise<void> {
    await this.rebuildAgentCard(context);
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

    // Query skill entities for Agent Card — metadata validated via schema
    let skills: SkillData[] | undefined;
    if (context.entityService.hasEntityType("skill")) {
      try {
        // Agent Card is publicly served — list only public skills so
        // non-public skill metadata cannot leak through the discovery surface.
        const entities = await context.entityService.listEntities({
          entityType: "skill",
          options: { filter: { visibilityScope: "public" } },
        });
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
      authEnabled: false,
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
   * Resolve caller permission from a verified HTTP signature when present.
   * Unsigned requests remain public.
   */
  private async resolveCaller(
    request: Request,
    body: string,
  ): Promise<{
    permissionLevel: UserPermissionLevel;
    callerDomain: string | null;
  }> {
    const verified = await verifyRequest(
      {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      },
      this.jwksResolver,
    );

    if (verified) {
      const grant = await getActiveAuthService()?.getA2APeerTrust(
        verified.domain,
      );
      const permissionLevel =
        grant?.keyFingerprint === verified.keyFingerprint
          ? grant.grantedLevel
          : "public";

      return {
        permissionLevel,
        callerDomain: verified.domain,
      };
    }

    return { permissionLevel: "public", callerDomain: null };
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

      const bodyText = await c.req.text();
      let caller: {
        permissionLevel: UserPermissionLevel;
        callerDomain: string | null;
      };
      try {
        caller = await this.resolveCaller(c.req.raw, bodyText);
      } catch {
        return this.withCors(c.json({ error: "Invalid HTTP signature" }, 401));
      }

      let body: unknown;
      try {
        body = JSON.parse(bodyText);
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

        const streamResult = handleStreamMessage(
          parsed.data.id,
          streamParams.data.message,
          {
            taskManager: this.taskManager,
            agentService: this.agentService,
            callerPermissionLevel: caller.permissionLevel,
            callerDomain: caller.callerDomain,
          },
        );

        if ("error" in streamResult) {
          return this.withCors(c.json(streamResult));
        }

        const { stream } = streamResult;

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
        callerPermissionLevel: caller.permissionLevel,
        callerDomain: caller.callerDomain,
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

  private createRequestSigner(): A2ARequestSigner | undefined {
    const authService = getActiveAuthService();
    if (!authService) return undefined;

    return async (request): Promise<void> => {
      const signingKey = await authService.getA2ASigningKey();
      await signRequest(request, signingKey.privateJwk, signingKey.keyId);
    };
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createAgentCallTool({
        requestSigner: this.createRequestSigner(),
        requestTimeoutMs: this.config.requestTimeoutMs,
        streamIdleTimeoutMs: this.config.streamIdleTimeoutMs,
        maxNetworkAttempts: this.config.maxNetworkAttempts,
        entityService: this.getContext().entityService,
      }),
    ];
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Agent-to-agent calls
- Use \`agent_call\` for exact domain-like agent ids (for example \`yeehaa.io\`, \`docs.rizom.ai\`, or \`save-it-regression.example\`). A domain-like id is bare text with a dot and no slash/protocol; \`.example\` test domains are still exact domain-like ids. For saved agents, the tool validates approval before network contact. For unsaved exact domains, it verifies the Agent Card over HTTPS and may perform a one-shot call without saving.
- Pass only an exact domain-like agent id to \`agent_call\`. If the user provides an HTTPS URL, pass only its hostname as the agent id (for \`https://docs.rizom.ai/a2a\`, pass \`docs.rizom.ai\`). Never pass a full URL, a non-HTTPS URL, or a display name like \`Brain\`.
- If the user names an exact domain-like agent id such as \`yeehaa.io\`, \`docs.rizom.ai\`, or \`refusal-followup.example\`, call \`agent_call\` directly with that id. Do not preflight with \`system_list\` or \`system_get\`; the tool reports structured errors such as invalid Agent Card, not approved, or archived.
- If the user asks you to ask, message, contact, hear what an exact domain-like agent id has to say, or ask that agent for its own skills/capabilities, treat that as an agent call request first and call \`agent_call\` in the same turn. Do not stop after listing the agent, drafting the question, searching general content locally, or reading saved agent entity metadata.
- After \`agent_call\` returns within a turn, answer that turn from its response. Do **not** supplement with \`system_get\` (or any other read tool) on the agent entity, unless the user explicitly asks for directory/profile details about the agent itself.
- Do not create, capture, or generate a note containing the user's question in the same turn as an agent contact request. The user asked to ask the agent, not to persist the question.
- If \`agent_call\` succeeds for an unsaved one-shot domain, you may offer to save/connect that agent for future calls, but do not auto-save it.
- If \`agent_call\` fails because auth, re-authentication, network, invalid Agent Card, or the remote agent is unavailable, report that failure directly. Do not say the agent was saved, connected, or may need to be saved/connected first. If useful, offer to add the agent contact using the word "add". Do not answer from memory, local docs, onboarding docs, or general knowledge; the requested agent was the source.
- Each new turn that asks the same exact domain-like agent id something — including short follow-ups like "what skills does it have", "and what about X", "tell me more" — is a **new** contact request and needs its **own** fresh \`agent_call\`. Do not assume the previous turn's agent response already covers a new question, and do not substitute \`system_list\`/\`system_get\` or a no-tool answer for the fresh call. If the previous turn targeted an exact domain-like id such as \`yeehaa.io\`, use that same id again for the follow-up even if the previous response was a refusal or error; let \`agent_call\` validate the current directory state again.
- When the user provides an HTTPS URL for an agent, use its hostname as the exact domain-like id for \`agent_call\`; the runtime verifies/contact over HTTPS. If the user provides a non-HTTPS URL, ask for the HTTPS agent URL or exact domain-like id instead.
- If the user refers to an agent by name, first make sure that name resolves to exactly one saved agent id. If multiple saved agents could match, ask a concise clarification question naming the matching saved agent ids and do not call any agent yet. Never choose the first match.
- After asking that clarification question, end the turn. Do not call \`agent_call\` later in the same turn.
- If \`agent_call\` reports that an exact domain-like agent id cannot be verified, tell the user the agent could not be verified/contacted. Do not create a wish, reminder, todo, note, fallback task, or any new entity.
- For non-HTTPS URLs and ambiguous display names, do not call \`agent_call\`; ask the user for the HTTPS agent URL, exact domain-like id, or a clarification first.
- Use \`agent_connect\`, not generic entity creation, when the user explicitly asks you to add, save, or connect an agent contact.
- If the target agent is discovered but not approved yet, do not call it and do not create a wish. Tell the user it must be approved first.`;
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
        this.logger.info("A2A server stopped");
      },
    };
  }
}
