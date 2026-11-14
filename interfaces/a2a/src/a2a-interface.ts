import {
  interfaceRuntime,
  withDaemon,
  withTools,
  withWebRoutes,
  type FirstPartySlotContext,
  type InterfaceRuntime,
  isLoopbackIssuer,
  issuerFromRequest,
  type WebRouteDefinition,
} from "@brains/sdk/internal/interface-runtime";
import {
  defineInterface,
  type UserPermissionLevel,
} from "@brains/sdk/interfaces";
import type { PluginPackageDefinition } from "@brains/sdk";
import {
  JwksResolver,
  signRequest,
  verifyRequest,
} from "@brains/http-signatures";
import type { AgentCard } from "@a2a-js/sdk";
import { Hono } from "hono";
import { a2aConfigSchema, type A2AConfig } from "./config";
import { buildAgentCard } from "./agent-card";
import { buildAgentDirectory } from "./agent-directory";
import { TaskManager } from "./task-manager";
import { A2ATurnSupervisor } from "./turn-supervisor";
import {
  handleJsonRpc,
  handleStreamMessage,
  jsonrpcRequestSchema,
  streamParamsSchema,
} from "./jsonrpc-handler";
import {
  createAgentCallTool,
  type A2AClientDeps,
  type A2ARequestSigner,
  type FetchFn,
} from "./client";
import { registerA2ACallMessageHandlers } from "./message-handlers";
import {
  RuntimePublicAskAllowance,
  type PublicAskAllowance,
} from "./public-asks";
import packageJson from "../package.json";
import { withHeaders } from "@brains/utils/http-response";

const A2A_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Signature, Signature-Input, Content-Digest, Date",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Runtime collaborators the interface needs that are not configuration.
 *
 * Config is schema-validated operator input; a fetch implementation is not.
 * Threading it here means a test can hand the outbound client a fake and read
 * the requests off it, instead of reassigning globalThis.fetch and restoring
 * it afterwards. Production leaves it unset and the client uses the global.
 */
export interface A2AInterfaceDeps {
  fetch?: FetchFn | undefined;
}

/** What a running A2A interface keeps between calls. */
interface A2AState {
  /** Whether the brain is ready, so the Agent Card reflects it. */
  cardReady: boolean;
  /** Whether the brain's HTTP host serves the card and JSON-RPC routes. */
  readonly servesHttp: boolean;
  readonly taskManager: TaskManager;
  readonly turnSupervisor: A2ATurnSupervisor;
  /** Resolves a peer's keys to verify its HTTP signature. */
  readonly jwksResolver: JwksResolver;
  /** How the outbound client and the a2a contracts reach peers. */
  readonly clientDeps: A2AClientDeps;
  /** The public callers' daily allowance, kept in this brain's runtime state. */
  readonly publicAsks: PublicAskAllowance;
}

type A2ASlotContext = FirstPartySlotContext<A2AConfig, A2AState>;

const withCors = (response: Response): Response =>
  withHeaders(response, A2A_CORS_HEADERS);

/** Signs outbound A2A requests when the brain has an HTTPS issuer. */
function createRequestSigner(
  runtime: InterfaceRuntime,
): A2ARequestSigner | undefined {
  const authService = runtime.auth();
  if (!authService) return undefined;

  const issuer = authService.getIssuer();
  // Remote peers cannot resolve loopback JWKS, and signature key IDs require HTTPS.
  if (isLoopbackIssuer(issuer) || new URL(issuer).protocol !== "https:") {
    return undefined;
  }

  return async (request): Promise<void> => {
    const signingKey = await authService.getA2ASigningKey();
    await signRequest(request, signingKey.privateJwk, signingKey.keyId);
  };
}

function createClientDeps(
  runtime: InterfaceRuntime,
  config: A2AConfig,
  deps: A2AInterfaceDeps,
): A2AClientDeps {
  const requestSigner = createRequestSigner(runtime);
  return {
    ...(requestSigner ? { requestSigner } : {}),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    requestTimeoutMs: config.requestTimeoutMs,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    maxNetworkAttempts: config.maxNetworkAttempts,
    entityService: runtime.entityReads,
  };
}

/**
 * Build the Agent Card from the brain's current identity, tools and skills.
 *
 * Built per request: identity and skills can land after startup (a seeded
 * anchor profile, a generated character, derived skills), and the card
 * must not keep serving the defaults it saw at ready.
 */
async function agentCardOf(
  runtime: InterfaceRuntime,
  config: A2AConfig,
  state: A2AState,
): Promise<AgentCard | undefined> {
  if (!state.cardReady) return undefined;

  return buildAgentCard({
    character: runtime.identity.get(),
    profile: runtime.identity.getProfile(),
    version: packageJson.version,
    ...(runtime.domain ? { domain: runtime.domain } : {}),
    ...(config.organization ? { organization: config.organization } : {}),
    profileKind: runtime.profileKinds.getResolved(),
    tools: runtime.tools.listForPermissionLevel("public"),
    skills: await runtime.publicSkills.list(),
    authEnabled: false,
  });
}

/**
 * Resolve caller permission from a verified HTTP signature when present.
 * Unsigned requests remain public.
 */
async function resolveCaller(
  runtime: InterfaceRuntime,
  state: A2AState,
  request: Request,
  body: string,
): Promise<{
  permissionLevel: UserPermissionLevel;
  isAnchor: boolean;
  callerDomain: string | null;
}> {
  const internalUrl = new URL(request.url);
  const externalUrl = new URL(
    `${internalUrl.pathname}${internalUrl.search}`,
    issuerFromRequest(request),
  );
  const verified = await verifyRequest(
    {
      method: request.method,
      url: externalUrl.toString(),
      headers: request.headers,
      body,
    },
    state.jwksResolver,
  );

  if (verified) {
    const grant = await runtime.auth()?.getA2APeerTrust(verified.domain);
    const permissionLevel =
      grant?.keyFingerprint === verified.keyFingerprint
        ? grant.grantedLevel
        : "public";

    return {
      permissionLevel,
      isAnchor: runtime.permissions.isAnchor("a2a", verified.domain),
      callerDomain: verified.domain,
    };
  }

  return { permissionLevel: "public", isAnchor: false, callerDomain: null };
}

/** The Agent Card, agent directory and JSON-RPC endpoint, as one Hono app. */
function createApp(
  runtime: InterfaceRuntime,
  config: A2AConfig,
  state: A2AState,
): Hono {
  const app = new Hono();
  const agentService = runtime.agent;

  app.get("/.well-known/agent-card.json", async (c) => {
    const agentCard = await agentCardOf(runtime, config, state);
    if (!agentCard) {
      return withCors(c.json({ error: "Agent Card not ready" }, 503));
    }
    return withCors(c.json(agentCard));
  });

  app.get("/.well-known/agent-directory.json", async (c) => {
    // Built per request: the directory must reflect approvals and
    // archivals live.
    const directory = await buildAgentDirectory(runtime.entityReads);
    return withCors(c.json(directory));
  });

  app.get("/a2a", (c) => {
    return withCors(
      c.json(
        {
          error: "Use POST with JSON-RPC 2.0 requests.",
          agentCard: "/.well-known/agent-card.json",
        },
        405,
      ),
    );
  });

  app.options("/a2a", () => withCors(new Response(null, { status: 204 })));

  app.post("/a2a", async (c) => {
    const bodyText = await c.req.text();
    let caller: {
      permissionLevel: UserPermissionLevel;
      isAnchor: boolean;
      callerDomain: string | null;
    };
    try {
      caller = await resolveCaller(runtime, state, c.req.raw, bodyText);
    } catch {
      return withCors(c.json({ error: "Invalid HTTP signature" }, 401));
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return withCors(
        c.json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        }),
      );
    }

    const parsed = jsonrpcRequestSchema.safeParse(body);
    if (!parsed.success) {
      return withCors(
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
        return withCors(
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
          taskManager: state.taskManager,
          turnSupervisor: state.turnSupervisor,
          agentService,
          callerPermissionLevel: caller.permissionLevel,
          callerIsAnchor: caller.isAnchor,
          callerDomain: caller.callerDomain,
          publicAsks: state.publicAsks,
        },
      );

      if ("error" in streamResult) {
        return withCors(c.json(streamResult));
      }

      return withCors(
        new Response(streamResult.stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }),
      );
    }

    const response = await handleJsonRpc(parsed.data, {
      taskManager: state.taskManager,
      turnSupervisor: state.turnSupervisor,
      agentService,
      callerPermissionLevel: caller.permissionLevel,
      callerIsAnchor: caller.isAnchor,
      callerDomain: caller.callerDomain,
      publicAsks: state.publicAsks,
    });

    return withCors(c.json(response));
  });

  return app;
}

export type A2AInterfaceDefinition = PluginPackageDefinition<
  typeof a2aConfigSchema,
  "interface"
>;

/**
 * A2A: the Agent-to-Agent protocol for inter-brain communication. It serves
 * an Agent Card for discovery and accepts tasks via JSON-RPC 2.0 on the
 * shared webserver, routes them through the agent, calls other brains with
 * agent_call, and answers the a2a contracts other packages ask it. The
 * collaborators default to the real ones; a test hands its own.
 */
export function createA2AInterface(
  deps: A2AInterfaceDeps = {},
): A2AInterfaceDefinition {
  const a2a = defineInterface({
    id: "a2a",
    config: a2aConfigSchema,
    setup: (context): A2AState => {
      const { config } = context;
      const runtime = interfaceRuntime(context);
      const { servesHttp } = runtime;
      const clientDeps = createClientDeps(runtime, config, deps);
      const state: A2AState = {
        cardReady: false,
        servesHttp,
        taskManager: new TaskManager(),
        turnSupervisor: new A2ATurnSupervisor(),
        // Inbound signature verification fetches the peer's JWKS through the
        // same fetch the outbound client uses, so one injected fake covers both.
        jwksResolver: new JwksResolver(deps.fetch ? { fetch: deps.fetch } : {}),
        clientDeps,
        publicAsks: new RuntimePublicAskAllowance(
          config.publicAsks,
          runtime.classRuntimeState,
        ),
      };

      registerA2ACallMessageHandlers(runtime, clientDeps, {
        networkAskTimeoutMs: config.networkAskTimeoutMs,
      });

      if (servesHttp) {
        runtime.endpoint({ label: "A2A", url: "/a2a", priority: 25 });
        runtime.interaction({
          id: "a2a",
          label: "A2A",
          description: "Let other agents discover and talk to this brain.",
          href: "/a2a",
          kind: "agent",
          priority: 25,
        });
        runtime.logger.info("A2A interface registered", {
          domain: runtime.domain,
        });
      } else {
        runtime.logger.info("A2A interface registered in tool-only mode", {
          domain: runtime.domain,
        });
      }

      runtime.ready(() => {
        state.cardReady = true;
      });
      return state;
    },
  });

  /** The card, directory and JSON-RPC routes, on the shared webserver only. */
  const withRoutes = withWebRoutes(a2a, (context: A2ASlotContext) => {
    const { config, state } = context;
    if (!state.servesHttp) {
      return [];
    }
    const runtime = interfaceRuntime(context);
    const app = createApp(runtime, config, state);
    const handleSharedRoute = (request: Request): Promise<Response> =>
      Promise.resolve(app.fetch(request));
    const route = (
      path: string,
      method: NonNullable<WebRouteDefinition["method"]>,
    ): WebRouteDefinition => ({
      path,
      method,
      public: true,
      handler: handleSharedRoute,
    });

    return [
      route("/.well-known/agent-card.json", "GET"),
      route("/.well-known/agent-directory.json", "GET"),
      route("/a2a", "GET"),
      route("/a2a", "POST"),
      route("/a2a", "OPTIONS"),
    ];
  });

  /** a2a:a2a, which closes the turns in flight when the brain stops. */
  const withLifecycle = withDaemon(withRoutes, (context: A2ASlotContext) => {
    const { state } = context;
    const { logger } = interfaceRuntime(context);
    return {
      id: "a2a",
      start: async (): Promise<void> => {
        if (state.servesHttp) {
          logger.info("A2A mounted on shared webserver host");
        } else {
          logger.info("A2A running without webserver routes");
        }
      },
      stop: async (): Promise<void> => {
        await state.turnSupervisor.close();
        logger.info("A2A server stopped");
      },
    };
  });

  /**
   * agent_call, which calls another brain. Its client is built for each
   * call, as the class built it each time it listed its tools, so a request
   * signer follows the auth backend the brain has then.
   */
  return withTools(withLifecycle, (context: A2ASlotContext) => {
    const { config } = context;
    const runtime = interfaceRuntime(context);
    const current = (): ReturnType<typeof createAgentCallTool> =>
      createAgentCallTool(createClientDeps(runtime, config, deps));
    return [
      {
        ...current(),
        handler: (input, toolContext) => current().handler(input, toolContext),
      },
    ];
  });
}
