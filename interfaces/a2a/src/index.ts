import type { AgentCard } from "@a2a-js/sdk";
import { JwksResolver, signRequest } from "@brains/http-signatures";
import { describeBrain } from "./card-source";
import {
  defineDaemon,
  defineInterface,
  defineRoute,
  isLoopbackIssuer,
  verbatim,
  type AnyInterfaceRouteDefinition,
} from "@brains/sdk/interfaces";
import type { Logger } from "@brains/utils/logger";
import type { Hono } from "hono";
import {
  agentCallTool,
  type A2AClientDeps,
  type A2ARequestSigner,
  type FetchFn,
} from "./client";
import { a2aConfigSchema, type A2AConfig, type A2AConfigInput } from "./config";
import { A2A_INSTRUCTIONS } from "./instructions";
import { a2aSubscriptions } from "./message-handlers";
import { createA2AServer } from "./server";
import { TaskManager } from "./task-manager";
import { A2ATurnSupervisor } from "./turn-supervisor";

export type { A2AConfig, A2AConfigInput } from "./config";
export { a2aConfigSchema } from "./config";

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

interface A2AState {
  readonly hasWebserver: boolean;
  readonly app: Hono;
  readonly clientDeps: A2AClientDeps;
  readonly turnSupervisor: A2ATurnSupervisor;
  readonly logger: Logger;
}

/**
 * The Agent-to-Agent protocol for inter-brain communication: an Agent Card
 * for discovery, JSON-RPC 2.0 at `/a2a` routed through the agent, a directory
 * of approved peers, and a call tool for reaching other brains.
 *
 * The routes mount on the shared HTTP host; without one the interface runs in
 * tool-only mode and still calls out. Trust in both directions is
 * auth-service's: inbound signatures are checked against recorded peer trust,
 * outbound requests are signed with the brain's federation key.
 */
export function a2aInterface(
  deps: A2AInterfaceDeps = {},
): ReturnType<typeof defineInterface> {
  return defineInterface({
    id: "a2a",
    config: a2aConfigSchema,

    setup: ({
      config,
      plugins,
      endpoints,
      interactions,
      auth,
      permissions,
      agent,
      entities,
      identity,
      profileKinds,
      tools,
      publicSkills,
      domain,
      logger,
    }): A2AState => {
      const hasWebserver = plugins.has("webserver");
      if (hasWebserver) {
        endpoints.register({ label: "A2A", url: "/a2a", priority: 25 });
        interactions.register({
          id: "a2a",
          label: "A2A",
          description: "Let other agents discover and talk to this brain.",
          href: "/a2a",
          kind: "agent",
          priority: 25,
        });
      }
      logger.info(
        hasWebserver
          ? "A2A interface registered"
          : "A2A interface registered in tool-only mode",
        { domain },
      );

      // Inbound signature verification fetches the peer's JWKS through the
      // same fetch the outbound client uses, so one injected fake covers both.
      const jwksResolver = new JwksResolver(
        deps.fetch ? { fetch: deps.fetch } : {},
      );

      // Built on first request and kept: the card describes the brain after
      // every plugin has registered and the profile has loaded, which no
      // moment during registration can promise.
      let card: Promise<AgentCard> | undefined;
      const agentCard = (): Promise<AgentCard> => {
        card ??= describeBrain(
          { identity, profileKinds, tools, publicSkills, domain },
          { organization: config.organization },
        ).catch((error: unknown) => {
          card = undefined;
          throw error;
        });
        return card;
      };

      // Remote peers cannot resolve loopback JWKS, and signature key ids
      // require HTTPS; anything else goes out unsigned.
      const requestSigner = (): A2ARequestSigner | undefined => {
        const federation = auth.getFederation();
        if (!federation) return undefined;
        const issuer = federation.getIssuer();
        if (isLoopbackIssuer(issuer) || new URL(issuer).protocol !== "https:") {
          return undefined;
        }
        return async (request): Promise<void> => {
          const signingKey = await federation.getA2ASigningKey();
          await signRequest(request, signingKey.privateJwk, signingKey.keyId);
        };
      };
      const signer = requestSigner();
      const clientDeps: A2AClientDeps = {
        ...(signer ? { requestSigner: signer } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        requestTimeoutMs: config.requestTimeoutMs,
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        maxNetworkAttempts: config.maxNetworkAttempts,
        entities,
      };

      const turnSupervisor = new A2ATurnSupervisor();
      return {
        hasWebserver,
        app: createA2AServer({
          agentCard,
          entities,
          agent,
          auth,
          permissions,
          jwksResolver,
          taskManager: new TaskManager(),
          turnSupervisor,
        }),
        clientDeps,
        turnSupervisor,
        logger,
      };
    },

    tools: ({ state }) => [agentCallTool(state.clientDeps)],

    subscriptions: ({ state }) => a2aSubscriptions(state.clientDeps),

    instructions: () => A2A_INSTRUCTIONS,

    // The protocol answers for itself: CORS headers, the status codes it
    // specifies, an event stream. None of it survives a JSON envelope.
    routes: ({ state }): AnyInterfaceRouteDefinition[] =>
      state.hasWebserver
        ? [
            ...(
              [
                "/.well-known/agent-card.json",
                "/.well-known/agent-directory.json",
              ] as const
            ).map((path) =>
              defineRoute({
                method: "GET",
                path,
                security: { kind: "public" },
                response: verbatim,
                handle: ({ request }) => state.app.fetch(request),
              }),
            ),
            ...(["GET", "POST", "OPTIONS"] as const).map((method) =>
              defineRoute({
                method,
                path: "/a2a",
                security: { kind: "public" },
                response: verbatim,
                handle: ({ request }) => state.app.fetch(request),
              }),
            ),
          ]
        : [],

    daemons: ({ state }) => [
      defineDaemon({
        id: "server",
        required: false,
        check: () => ({
          status: "healthy",
          message: state.hasWebserver
            ? "A2A mounted on shared webserver host"
            : "A2A running without webserver routes",
        }),
        async run({ signal, health }) {
          state.logger.info(
            state.hasWebserver
              ? "A2A mounted on shared webserver host"
              : "A2A running without webserver routes",
          );
          health.ready();
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
          // Stopping ends every turn in flight: a peer waiting on a stream
          // learns the brain is gone rather than hanging.
          await state.turnSupervisor.close();
          state.logger.info("A2A server stopped");
        },
      }),
    ],
  });
}

const a2aPackage: ReturnType<typeof defineInterface> = a2aInterface();
export default a2aPackage;

export type { A2AConfig as A2AInterfaceConfig };
export type { A2AConfigInput as A2AInterfaceConfigInput };
export { buildAgentCard } from "./agent-card";
export { describeBrain, type AgentCardSource } from "./card-source";
export { buildAgentDirectory } from "./agent-directory";
export {
  agentCallTool,
  executeAgentCall,
  parseA2AResponse,
  type A2ACallData,
  type A2ACallResponse,
  type A2AClientDeps,
  type A2ARequestSigner,
  type FetchFn,
} from "./client";
export { a2aSubscriptions } from "./message-handlers";
export { A2A_INSTRUCTIONS } from "./instructions";
export { TaskManager } from "./task-manager";
export { A2ATurnSupervisor } from "./turn-supervisor";
export {
  handleJsonRpc,
  handleStreamMessage,
  jsonrpcRequestSchema,
  streamParamsSchema,
} from "./jsonrpc-handler";
