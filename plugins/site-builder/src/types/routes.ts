import { z } from "zod";

/**
 * Section definition schema
 */
export const SectionDefinitionSchema = z.object({
  id: z.string(),
  template: z.string(), // Template name for rendering this section
  content: z.unknown().optional(), // Static content
  contentEntity: z
    .object({
      entityType: z.string(), // Entity type to fetch content from
      template: z.string().optional(), // Template for entity queries
      query: z
        .object({
          id: z.string().optional(), // Entity ID for detail views
          limit: z.number().optional(), // Limit for list views
          offset: z.number().optional(), // Offset for pagination
        })
        .passthrough()
        .optional(), // Query parameters for fetching entities - allows additional properties
    })
    .optional(),
  order: z.number().optional(), // Section ordering
});

/**
 * Route definition schema
 */
export const RouteDefinitionSchema = z.object({
  id: z.string(), // Unique route identifier
  path: z.string(), // URL path
  title: z.string(), // Route title
  description: z.string(), // Route description
  sections: z.array(SectionDefinitionSchema), // Page sections
  pluginId: z.string().optional(), // Plugin that registered this route
  environment: z.string().optional(), // Environment (production, development, etc)
  sourceEntityType: z.string().optional(), // Entity type that generated this route (indicates dynamic)
});

// Type exports
export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;
export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;

/**
 * Message payload schemas for route operations
 */
export const RegisterRoutesPayloadSchema = z.object({
  routes: z.array(RouteDefinitionSchema),
  pluginId: z.string(),
  environment: z.string().optional(),
});

export const UnregisterRoutesPayloadSchema = z.object({
  paths: z.array(z.string()).optional(), // Specific paths to unregister
  pluginId: z.string().optional(), // Or all routes from a plugin
});

export const ListRoutesPayloadSchema = z.object({
  pluginId: z.string().optional(), // Filter by plugin
  environment: z.string().optional(), // Filter by environment
});

export const GetRoutePayloadSchema = z.object({
  path: z.string(),
});

// Type exports from schemas
export type RegisterRoutesPayload = z.infer<typeof RegisterRoutesPayloadSchema>;
export type UnregisterRoutesPayload = z.infer<
  typeof UnregisterRoutesPayloadSchema
>;
export type ListRoutesPayload = z.infer<typeof ListRoutesPayloadSchema>;
export type GetRoutePayload = z.infer<typeof GetRoutePayloadSchema>;

/**
 * Response types for route operations
 */
export interface RouteResponse {
  success: boolean;
  error?: string;
}

export interface RouteListResponse extends RouteResponse {
  routes?: RouteDefinition[];
}

export interface SingleRouteResponse extends RouteResponse {
  route?: RouteDefinition;
}
