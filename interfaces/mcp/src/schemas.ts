import { z } from "zod";

export const mcpConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]).default("stdio"),
  httpPort: z
    .number()
    .default(3000)
    .describe("Port for HTTP transport (only used when transport is 'http')"),
});

export const MCP_CONFIG_DEFAULTS = {
  transport: "stdio" as const,
  httpPort: 3000,
};
