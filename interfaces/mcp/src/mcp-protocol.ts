import type { PluginPackageDefinition } from "@brains/sdk";
import { defineInterface } from "@brains/sdk/interfaces";
import {
  interfaceRuntime,
  withTools,
} from "@brains/sdk/internal/interface-runtime";
import { createMCPTools } from "./tools";
import { setupJobProgressListener } from "./handlers";
import { mcpProtocolConfigSchema } from "./config";

/**
 * The MCP protocol surface for an embedding-owned connection: the chat and
 * confirm tools, job progress logged, and the protocol mode set on the
 * brain's MCP service. The embedding creates SDK servers through that
 * service and owns their lifetime and trusted caller context; this opens no
 * HTTP or stdio host.
 */
export const mcpProtocol: PluginPackageDefinition<
  typeof mcpProtocolConfigSchema,
  "interface"
> = withTools(
  defineInterface({
    id: "mcp",
    config: mcpProtocolConfigSchema,
    setup: (context): Record<never, never> => {
      const runtime = interfaceRuntime(context);
      setupJobProgressListener(runtime, runtime.logger);
      runtime.mcpTransport.setProtocolMode(context.config.mode);
      return {};
    },
  }),
  (context) => {
    const runtime = interfaceRuntime(context);
    return createMCPTools("mcp", () => runtime);
  },
);
