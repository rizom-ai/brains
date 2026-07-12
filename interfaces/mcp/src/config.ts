import { z } from "@brains/utils/zod";

export type MCPMode = "basic" | "debug";

export interface MCPConfig {
  transport: "stdio" | "http";
  mode: MCPMode;
  httpPort: number;
  authToken?: string | undefined;
  sessionIdleTtlMs: number;
}

export interface MCPConfigInput {
  transport?: "stdio" | "http" | undefined;
  mode?: MCPMode | undefined;
  httpPort?: number | undefined;
  authToken?: string | undefined;
  sessionIdleTtlMs?: number | undefined;
}

export const mcpConfigSchema: z.ZodType<MCPConfig, MCPConfigInput> = z.object({
  transport: z.enum(["stdio", "http"]).default("http"),
  mode: z.enum(["basic", "debug"]).default("basic"),
  httpPort: z
    .number()
    .describe("Port for HTTP transport (only used when transport is 'http')")
    .default(3333),
  authToken: z
    .string()
    .describe("Bearer token for HTTP transport authentication")
    .optional(),
  sessionIdleTtlMs: z
    .number()
    .describe(
      "Idle time in ms after which an HTTP session is closed and evicted",
    )
    .default(30 * 60 * 1000),
});
