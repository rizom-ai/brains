import { InterfacePlugin, type InterfacePluginContext } from "@brains/plugins";
import type { Daemon } from "@brains/plugins";
import type { AgentCard } from "@a2a-js/sdk";
import { Hono } from "hono";
import { a2aConfigSchema, type A2AConfig } from "./config";
import { buildAgentCard } from "./agent-card";
import packageJson from "../package.json";

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
  private server: ReturnType<typeof Bun.serve> | undefined;
  private unsubscribeReady: (() => void) | undefined;

  constructor(config: Partial<A2AConfig> = {}) {
    super("a2a", packageJson, config, a2aConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Build Agent Card after all plugins have registered
    // so we can see the full tool registry
    this.unsubscribeReady = context.messaging.subscribe(
      "system:plugins:ready",
      () => {
        this.rebuildAgentCard(context);
        return { noop: true as const };
      },
    );

    this.logger.info("A2A interface registered", {
      domain: this.config.domain,
    });
  }

  /**
   * Rebuild the Agent Card from current brain identity and registered tools
   */
  private rebuildAgentCard(context: InterfacePluginContext): void {
    const character = context.identity.get();
    const tools = context.tools.listForPermissionLevel("public");

    this.agentCard = buildAgentCard({
      character,
      version: packageJson.version,
      domain: this.config.domain,
      organization: this.config.organization,
      tools,
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

  protected override createDaemon(): Daemon | undefined {
    const app = new Hono();

    // Agent Card discovery endpoint
    app.get("/.well-known/agent-card.json", (c) => {
      if (!this.agentCard) {
        return c.json({ error: "Agent Card not ready" }, 503);
      }
      return c.json(this.agentCard);
    });

    // JSON-RPC 2.0 endpoint (task handling - to be implemented)
    app.post("/a2a", async (c) => {
      // TODO: Implement JSON-RPC handler for tasks/send, tasks/get, etc.
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not yet implemented" },
          id: null,
        },
        501,
      );
    });

    return {
      start: async (): Promise<void> => {
        this.server = Bun.serve({
          port: this.config.port,
          fetch: app.fetch,
        });
        this.logger.info(
          `A2A server listening on http://localhost:${this.config.port}`,
        );
      },
      stop: async (): Promise<void> => {
        this.unsubscribeReady?.();
        if (this.server) {
          await this.server.stop();
          this.server = undefined;
        }
        this.logger.info("A2A server stopped");
      },
    };
  }
}
