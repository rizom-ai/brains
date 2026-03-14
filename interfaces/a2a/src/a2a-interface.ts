import {
  InterfacePlugin,
  type InterfacePluginContext,
  type PluginTool,
} from "@brains/plugins";
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

  constructor(config: Partial<A2AConfig> = {}) {
    super("a2a", packageJson, config, a2aConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Build Agent Card from brain identity + public tools
    const character = context.identity.get();
    const tools = await this.getPublicTools();

    this.agentCard = buildAgentCard({
      character,
      version: packageJson.version,
      domain: this.config.domain,
      organization: this.config.organization,
      tools,
    });

    this.logger.info("A2A interface registered", {
      skills: this.agentCard.skills.length,
      domain: this.config.domain,
    });
  }

  /**
   * Get the current Agent Card
   */
  getAgentCard(): AgentCard | undefined {
    return this.agentCard;
  }

  /**
   * Get tools filtered to public visibility for the Agent Card
   */
  private async getPublicTools(): Promise<PluginTool[]> {
    // TODO: Filter tools by public permission level
    // For now, return all tools from the interface's getTools
    return this.getTools();
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
        if (this.server) {
          await this.server.stop();
          this.server = undefined;
        }
        this.logger.info("A2A server stopped");
      },
    };
  }
}
