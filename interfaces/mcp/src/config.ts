import { z } from "@brains/utils/zod";

type MCPConfigSchema = z.ZodObject<{
  transport: z.ZodDefault<z.ZodEnum<{ stdio: "stdio"; http: "http" }>>;
  mode: z.ZodDefault<z.ZodEnum<{ basic: "basic"; debug: "debug" }>>;
  httpPort: z.ZodDefault<z.ZodNumber>;
  authToken: z.ZodOptional<z.ZodString>;
}>;

export const mcpProtocolConfigSchema: z.ZodObject<{
  mode: z.ZodDefault<z.ZodEnum<{ basic: "basic"; debug: "debug" }>>;
}> = z.object({
  mode: z.enum(["basic", "debug"]).default("basic"),
});
export type MCPProtocolConfig = z.output<typeof mcpProtocolConfigSchema>;
export type MCPProtocolConfigInput = z.input<typeof mcpProtocolConfigSchema>;

export const mcpConfigSchema: MCPConfigSchema = mcpProtocolConfigSchema.extend({
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
export type MCPMode = MCPConfig["mode"];
