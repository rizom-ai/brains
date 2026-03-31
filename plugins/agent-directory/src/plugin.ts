import type { Plugin, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createAgentDirectoryTools } from "./tools";
import type { AgentDirectoryDeps } from "./tools";
import packageJson from "../package.json";

const configSchema = z.object({});

export class AgentDirectoryServicePlugin extends ServicePlugin {
  private readonly deps: AgentDirectoryDeps;
  private cachedTools: Tool[] | null = null;

  constructor(deps: AgentDirectoryDeps = {}) {
    super("agent-directory", packageJson, {}, configSchema);
    this.deps = deps;
  }

  protected override async getTools(): Promise<Tool[]> {
    if (this.cachedTools) return this.cachedTools;
    this.cachedTools = createAgentDirectoryTools(
      this.id,
      this.getContext(),
      this.deps,
    );
    return this.cachedTools;
  }
}

export function agentDirectoryServicePlugin(
  deps: AgentDirectoryDeps = {},
): Plugin {
  return new AgentDirectoryServicePlugin(deps);
}
