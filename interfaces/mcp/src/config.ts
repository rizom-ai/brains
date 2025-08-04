import { z } from "zod";

export const mcpConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]),
  httpPort: z
    .number()
    .describe("Port for HTTP transport (only used when transport is 'http')"),
});

export type MCPConfig = z.infer<typeof mcpConfigSchema>;
export type MCPConfigInput = Partial<MCPConfig>;
