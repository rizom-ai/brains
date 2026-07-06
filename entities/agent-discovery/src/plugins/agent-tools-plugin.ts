import type { Plugin, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createAgentConnectTool } from "../tools/agent-connect";
import type { FetchFn } from "../lib/fetch-agent-card";
import packageJson from "../../package.json";

type AgentToolsConfig = Record<string, never>;
type AgentToolsConfigInput = Record<string, never>;

const agentToolsConfigSchema: z.ZodType<
  AgentToolsConfig,
  AgentToolsConfigInput
> = z.object({}).strict();

export class AgentToolsPlugin extends ServicePlugin<
  AgentToolsConfig,
  AgentToolsConfigInput
> {
  private readonly fetchFn: FetchFn | undefined;

  constructor(fetchFn?: FetchFn) {
    super("agent", packageJson, {}, agentToolsConfigSchema);
    this.fetchFn = fetchFn;
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createAgentConnectTool(this.getContext(), this.fetchFn)];
  }
}

export function agentToolsPlugin(): Plugin {
  return new AgentToolsPlugin();
}
