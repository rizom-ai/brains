import type { Plugin, Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { AgentAdapter } from "@brains/agent-directory";
import { createAgentDirectoryTools } from "./tools";
import type { AgentDirectoryDeps } from "./tools";
import {
  handleA2ACallCompleted,
  type A2ACallCompletedPayload,
} from "./lib/auto-create";
import packageJson from "../package.json";

const configSchema = z.object({});
const agentAdapter = new AgentAdapter();

export class AgentDirectoryServicePlugin extends ServicePlugin {
  private readonly deps: AgentDirectoryDeps;
  private cachedTools: Tool[] | null = null;

  constructor(deps: AgentDirectoryDeps = {}) {
    super("agent-directory", packageJson, {}, configSchema);
    this.deps = deps;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Subscribe to auto-create events from a2a_call
    const fetchFn = this.deps.fetch ?? globalThis.fetch;
    context.messaging.subscribe<A2ACallCompletedPayload>(
      "a2a:call:completed",
      async (msg) => {
        try {
          await handleA2ACallCompleted(
            context.entityService,
            agentAdapter,
            fetchFn,
            msg.payload,
          );
        } catch (error) {
          this.logger.error("Failed to auto-create agent entity", { error });
        }
        return { success: true };
      },
    );
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
