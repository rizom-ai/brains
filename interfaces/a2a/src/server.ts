import type { AgentCard } from "@a2a-js/sdk";
import { verifyRequest, type JwksResolver } from "@brains/http-signatures";
import {
  issuerFromRequest,
  type AgentNamespace,
  type InterfaceEntityReader,
  type InterfaceSetupContext,
  type UserPermissionLevel,
} from "@brains/sdk/interfaces";
import type { z } from "@brains/sdk/interfaces";
import { Hono } from "hono";
import { buildAgentDirectory } from "./agent-directory";
import {
  handleJsonRpc,
  handleStreamMessage,
  jsonrpcRequestSchema,
  streamParamsSchema,
} from "./jsonrpc-handler";
import type { TaskManager } from "./task-manager";
import type { A2ATurnSupervisor } from "./turn-supervisor";

const A2A_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Signature, Signature-Input, Content-Digest, Date",
  "X-Content-Type-Options": "nosniff",
} as const;

/** What the A2A HTTP surface answers with: the card, the directory, the peers. */
export interface A2AServerDependencies {
  /** The card, built on first request and kept. */
  readonly agentCard: () => Promise<AgentCard>;
  readonly entities: InterfaceEntityReader;
  readonly agent: AgentNamespace;
  readonly auth: InterfaceSetupContext<z.ZodType<object, object>>["auth"];
  readonly permissions: Pick<
    InterfaceSetupContext<z.ZodType<object, object>>["permissions"],
    "isAnchor"
  >;
  readonly jwksResolver: JwksResolver;
  readonly taskManager: TaskManager;
  readonly turnSupervisor: A2ATurnSupervisor;
}

interface ResolvedCaller {
  permissionLevel: UserPermissionLevel;
  isAnchor: boolean;
  callerDomain: string | null;
}

function withCors(response: Response): Response {
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

/**
 * Resolve caller permission from a verified HTTP signature when present.
 * Unsigned requests remain public.
 */
async function resolveCaller(
  deps: A2AServerDependencies,
  request: Request,
  body: string,
): Promise<ResolvedCaller> {
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
    deps.jwksResolver,
  );

  if (verified) {
    const grant = await deps.auth
      .getFederation()
      ?.getA2APeerTrust(verified.domain);
    const permissionLevel =
      grant?.keyFingerprint === verified.keyFingerprint
        ? grant.grantedLevel
        : "public";
    return {
      permissionLevel,
      isAnchor: deps.permissions.isAnchor("a2a", verified.domain),
      callerDomain: verified.domain,
    };
  }

  return { permissionLevel: "public", isAnchor: false, callerDomain: null };
}

/** The Hono app behind the five shared-host routes. */
export function createA2AServer(deps: A2AServerDependencies): Hono {
  const app = new Hono();

  app.get("/.well-known/agent-card.json", async (c) => {
    try {
      return withCors(c.json(await deps.agentCard()));
    } catch {
      return withCors(c.json({ error: "Agent Card not ready" }, 503));
    }
  });

  app.get("/.well-known/agent-directory.json", async (c) => {
    // Built per request: the directory must reflect approvals and
    // archivals live, unlike the identity-shaped cached Agent Card.
    return withCors(c.json(await buildAgentDirectory(deps.entities)));
  });

  app.get("/a2a", (c) =>
    withCors(
      c.json(
        {
          error: "Use POST with JSON-RPC 2.0 requests.",
          agentCard: "/.well-known/agent-card.json",
        },
        405,
      ),
    ),
  );

  app.options("/a2a", () => withCors(new Response(null, { status: 204 })));

  app.post("/a2a", async (c) => {
    const bodyText = await c.req.text();
    let caller: ResolvedCaller;
    try {
      caller = await resolveCaller(deps, c.req.raw, bodyText);
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

    const handlerContext = {
      taskManager: deps.taskManager,
      turnSupervisor: deps.turnSupervisor,
      agentService: deps.agent,
      callerPermissionLevel: caller.permissionLevel,
      callerIsAnchor: caller.isAnchor,
      callerDomain: caller.callerDomain,
    };

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
        handlerContext,
      );
      if ("error" in streamResult) return withCors(c.json(streamResult));

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

    return withCors(c.json(await handleJsonRpc(parsed.data, handlerContext)));
  });

  return app;
}
