import {
  InterfacePlugin,
  type InterfacePluginContext,
  type PluginTool,
} from "@brains/plugins";
import type { Daemon } from "@brains/plugins";
import type { AgentCard } from "@a2a-js/sdk";
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
    return {
      start: async (): Promise<void> => {
        // TODO: Start Hono HTTP server on config.port
        // Serve GET /.well-known/agent-card.json
        // Serve POST /a2a (JSON-RPC 2.0)
        this.logger.info(`A2A server starting on port ${this.config.port}`);
      },
      stop: async (): Promise<void> => {
        this.logger.info("A2A server stopped");
      },
    };
  }
}
