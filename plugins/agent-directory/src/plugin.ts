import type { Plugin, Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createAgentDirectoryTools } from "./tools";
import type { AgentDirectoryDeps } from "./tools";
import packageJson from "../package.json";

const agentDirectoryConfigSchema = z.object({});
type AgentDirectoryConfig = z.infer<typeof agentDirectoryConfigSchema>;

export class AgentDirectoryServicePlugin extends ServicePlugin<AgentDirectoryConfig> {
  private readonly deps: AgentDirectoryDeps;

  constructor(
    config: Partial<AgentDirectoryConfig> = {},
    deps: AgentDirectoryDeps = {},
  ) {
    super("agent-directory", packageJson, config, agentDirectoryConfigSchema);
    this.deps = deps;
  }

  protected override async onRegister(
    _context: ServicePluginContext,
  ): Promise<void> {
    // No additional registration needed — tools handle everything
  }

  protected override async getTools(): Promise<Tool[]> {
    return createAgentDirectoryTools(this.id, this.getContext(), this.deps);
  }
}

export function agentDirectoryServicePlugin(
  config: Partial<AgentDirectoryConfig> = {},
  deps: AgentDirectoryDeps = {},
): Plugin {
  return new AgentDirectoryServicePlugin(config, deps);
}
