import { z } from "@brains/utils/zod";

export interface MCPConfig {
  transport: "stdio" | "http";
  httpPort: number;
  authToken?: string | undefined;
}

export interface MCPConfigInput {
  transport?: "stdio" | "http" | undefined;
  httpPort?: number | undefined;
  authToken?: string | undefined;
}

export const mcpConfigSchema: z.ZodType<MCPConfig, MCPConfigInput> = z.object({
  transport: z.enum(["stdio", "http"]).default("http"),
  httpPort: z
    .number()
    .describe("Port for HTTP transport (only used when transport is 'http')")
    .default(3333),
  authToken: z
    .string()
    .describe("Bearer token for HTTP transport authentication")
    .optional(),
});
