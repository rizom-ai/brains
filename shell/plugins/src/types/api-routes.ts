import { z } from "@brains/utils/zod";

export const apiRouteDefinitionSchema: z.ZodObject<{
  path: z.ZodString;
  method: z.ZodDefault<
    z.ZodEnum<{ GET: "GET"; POST: "POST"; PUT: "PUT"; DELETE: "DELETE" }>
  >;
  tool: z.ZodString;
  public: z.ZodDefault<z.ZodBoolean>;
  successRedirect: z.ZodOptional<z.ZodString>;
  errorRedirect: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Path suffix (prefixed with /api/{pluginId}) */
  path: z.string(),
  /** HTTP method */
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  /** Tool to invoke (without plugin prefix) */
  tool: z.string(),
  /** Allow unauthenticated access */
  public: z.boolean().default(false),
  /** Redirect URL on success (for form submissions) */
  successRedirect: z.string().optional(),
  /** Redirect URL on error (for form submissions) */
  errorRedirect: z.string().optional(),
});

export type ApiRouteDefinition = z.output<typeof apiRouteDefinitionSchema>;

/**
 * A registered API route with full path and plugin context
 * Returned by Shell.getPluginApiRoutes()
 */
export interface RegisteredApiRoute {
  /** The plugin that registered this route */
  pluginId: string;
  /** Full path including /api/{pluginId} prefix */
  fullPath: string;
  /** The original route definition */
  definition: ApiRouteDefinition;
}
