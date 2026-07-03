import { z } from "@brains/utils/zod";

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
  sessionIdleTtlMs: z
    .number()
    .describe(
      "Idle time in ms after which an HTTP session is closed and evicted",
    )
    .default(30 * 60 * 1000),
});

export type MCPConfig = z.infer<typeof mcpConfigSchema>;
