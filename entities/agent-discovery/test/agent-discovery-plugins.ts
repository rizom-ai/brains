import type { Plugin } from "@brains/plugins";
import {
  agentDiscovery,
  type AgentDiscoveryCompositeConfigInput,
} from "../src";

/** The agents capability's plugins, as the canonical brain installs them. */
export function createAgentDiscoveryPlugins(
  config: AgentDiscoveryCompositeConfigInput = {},
): Plugin[] {
  return agentDiscovery(config);
}
