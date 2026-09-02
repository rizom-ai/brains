import { z } from "@brains/utils/zod";

type MCPConfigSchema = z.ZodObject<{
  transport: z.ZodDefault<z.ZodEnum<{ stdio: "stdio"; http: "http" }>>;
  mode: z.ZodDefault<z.ZodEnum<{ basic: "basic"; debug: "debug" }>>;
  httpPort: z.ZodDefault<z.ZodNumber>;
  authToken: z.ZodOptional<z.ZodString>;
}>;

export const mcpConfigSchema: MCPConfigSchema = z.object({
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
});

export type MCPConfig = z.output<typeof mcpConfigSchema>;
export type MCPConfigInput = z.input<typeof mcpConfigSchema>;
export type MCPMode = MCPConfig["mode"];
