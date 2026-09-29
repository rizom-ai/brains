import {
  InterfacePlugin,
  type InterfacePluginContext,
  type Tool,
} from "@brains/plugins";
import { createMCPTools } from "./tools";
import { setupJobProgressListener } from "./handlers";
import {
  mcpProtocolConfigSchema,
  type MCPProtocolConfig,
  type MCPProtocolConfigInput,
} from "./config";
import packageJson from "../package.json";

/** Shared registration and handler lifecycle; no transport I/O or host policy. */
export abstract class MCPProtocolPlugin<
  TConfig,
  TInput,
> extends InterfacePlugin<TConfig, TInput> {
  protected override async getTools(): Promise<Tool[]> {
    return createMCPTools(this.id, () => this.context);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    setupJobProgressListener(context, this.logger);
  }
}

/**
 * The MCP protocol surface for an embedding-owned connection. The embedding
 * creates SDK servers through the shell's MCP service and owns their lifetime
 * and trusted caller context. This plugin opens no HTTP or stdio host.
 */
export class MCPProtocol extends MCPProtocolPlugin<
  MCPProtocolConfig,
  MCPProtocolConfigInput
> {
  constructor(config: MCPProtocolConfigInput = {}) {
    super("mcp", packageJson, config, mcpProtocolConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.mcpTransport.setProtocolMode(this.config.mode);
  }
}
