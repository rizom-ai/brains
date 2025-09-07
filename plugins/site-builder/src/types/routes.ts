import { z } from "@brains/utils";

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
 * Navigation metadata schema for route definitions
 */
export const NavigationMetadataSchema = z
  .object({
    show: z.boolean().default(false), // Display in navigation?
    label: z.string().optional(), // Override title for nav display
    slot: z.enum(["main"]), // Navigation slot type
    priority: z.number().min(0).max(100).default(50), // Display order (0-100)
  })
  .optional();

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
  sourceEntityType: z.string().optional(), // Entity type that generated this route (indicates dynamic)
  navigation: NavigationMetadataSchema, // Optional navigation metadata
});

// Type exports
export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;
export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;
export type NavigationMetadata = z.infer<typeof NavigationMetadataSchema>;

// Navigation item interface for extracted navigation data
export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

/**
 * Message payload schemas for route operations
 */
export const RegisterRoutesPayloadSchema = z.object({
  routes: z.array(RouteDefinitionSchema),
  pluginId: z.string(),
});

export const UnregisterRoutesPayloadSchema = z.object({
  paths: z.array(z.string()).optional(), // Specific paths to unregister
  pluginId: z.string().optional(), // Or all routes from a plugin
});

export const ListRoutesPayloadSchema = z.object({
  pluginId: z.string().optional(), // Filter by plugin
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
