import { z } from "@brains/utils";

export const mcpConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]).default("http"),
  httpPort: z
    .number()
    .describe("Port for HTTP transport (only used when transport is 'http')")
    .default(3333),
  auth: z
    .object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
    })
    .describe("Authentication configuration for HTTP transport")
    .optional(),
});

export type MCPConfig = z.infer<typeof mcpConfigSchema>;
