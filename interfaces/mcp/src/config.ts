import { z } from "@brains/utils/zod-v4";

export const mcpConfigSchema = z.object({
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

export type MCPConfig = z.output<typeof mcpConfigSchema>;
export type MCPConfigInput = z.input<typeof mcpConfigSchema>;
