import type { Plugin, ServicePluginContext, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createAgentConnectTool } from "../tools/agent-connect";
import {
  createAgentScanDirectoriesTool,
  scanAgentDirectories,
} from "../tools/agent-scan-directories";
import { createAgentSetTrustLevelTool } from "../tools/agent-set-trust-level";
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

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.recurringChecks.register({
      id: "directory-scan",
      cadence: "daily",
      run: async ({ signal }) => {
        const result = await scanAgentDirectories(
          context,
          this.fetchFn,
          signal,
        );
        if (result.created === 0) return {};

        const createdDomains = [...result.createdDomains].sort();
        const peers = [...result.introducingPeers].sort();
        const countLabel = `${result.created} agent${result.created === 1 ? "" : "s"}`;
        return {
          alerts: [
            {
              dedupeKey: `sightings:${computeContentHash(
                `${result.observedAt}\0${createdDomains.join("\0")}`,
              )}`,
              title: "New agent sightings",
              body: `${countLabel} sighted through ${peers.join(", ")}`,
            },
          ],
        };
      },
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createAgentConnectTool(this.getContext(), this.fetchFn),
      createAgentScanDirectoriesTool(this.getContext(), this.fetchFn),
      createAgentSetTrustLevelTool(this.getContext(), this.fetchFn),
    ];
  }
}

export function agentToolsPlugin(): Plugin {
  return new AgentToolsPlugin();
}
