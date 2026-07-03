import type { Plugin, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createAgentConnectTool } from "../tools/agent-connect";
import type { FetchFn } from "../lib/fetch-agent-card";
import packageJson from "../../package.json";

const agentToolsConfigSchema = z.object({}).strict();

type AgentToolsConfig = z.infer<typeof agentToolsConfigSchema>;

export class AgentToolsPlugin extends ServicePlugin<AgentToolsConfig> {
  constructor(private readonly fetchFn?: FetchFn) {
    super("agent", packageJson, {}, agentToolsConfigSchema);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createAgentConnectTool(this.getContext(), this.fetchFn)];
  }
}

export function agentToolsPlugin(): Plugin {
  return new AgentToolsPlugin();
}
