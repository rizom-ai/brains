import { z } from "@brains/utils/zod";

type MCPConfigSchema = z.ZodObject<{
  transport: z.ZodDefault<z.ZodEnum<{ stdio: "stdio"; http: "http" }>>;
  mode: z.ZodDefault<z.ZodEnum<{ basic: "basic"; debug: "debug" }>>;
  httpPort: z.ZodOptional<z.ZodNever>;
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
  // A legacy setting, removed with the standalone listener: MCP is mounted on the brain's own
  // web server. A configuration that still sets it is refused with what to do.
  httpPort: z
    .never({
      error:
        "httpPort is no longer supported: MCP is served by the brain's own web server; remove this setting",
    })
    .optional(),
  authToken: z
    .string()
    .describe(
      "Static bearer token for HTTP transport authentication; local development only, a production brain refuses it",
    )
    .optional(),
});

export type MCPConfig = z.output<typeof mcpConfigSchema>;
export type MCPConfigInput = z.input<typeof mcpConfigSchema>;
