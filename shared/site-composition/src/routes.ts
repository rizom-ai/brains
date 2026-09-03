import { z } from "@brains/utils/zod";
import type {
  NavigationItem,
  NavigationMetadata,
  NavigationMetadataInput,
  RouteDefinition,
  RouteDefinitionInput,
  RouteSectionDefinition as SectionDefinition,
  SectionDefinitionInput,
} from "@rizom/site";

export type {
  EntityDisplayEntry,
  NavigationItem,
  NavigationMetadata,
  NavigationMetadataInput,
  NavigationSlot,
  RouteDefinition,
  RouteDefinitionInput,
  RouteSectionDefinition as SectionDefinition,
  SectionDefinitionInput,
} from "@rizom/site";

/** Section definition schema for site routes. */
export const SectionDefinitionSchema: z.ZodType<
  SectionDefinition,
  SectionDefinitionInput
> = z.object({
  id: z.string(),
  template: z.string(),
  content: z.unknown().optional(),
  dataQuery: z
    .looseObject({
      entityType: z.string().optional(),
      template: z.string().optional(),
      query: z
        .looseObject({
          id: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  order: z.number().optional(),
});

/** Navigation slot types. */
export const NavigationSlots = ["primary", "secondary"] as const;

/** Navigation metadata schema for route definitions. */
export const NavigationMetadataSchema: z.ZodType<
  NavigationMetadata | undefined,
  NavigationMetadataInput | undefined
> = z
  .object({
    show: z.boolean().default(false),
    label: z.string().optional(),
    slot: z.enum(NavigationSlots).default("primary"),
    priority: z.number().min(0).max(100).default(50),
  })
  .optional();

/** Route definition schema. */
export const RouteDefinitionSchema: z.ZodType<
  RouteDefinition,
  RouteDefinitionInput
> = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().default(""),
  /** Bare display label without any page-suffix. Used for visual headings on list pages. */
  pageLabel: z.string().optional(),
  description: z.string().default(""),
  sections: z.array(SectionDefinitionSchema).default([]),
  layout: z.string().default("default"),
  fullscreen: z.boolean().optional(),
  pluginId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  external: z.boolean().optional(),
  navigation: NavigationMetadataSchema,
});

/** Message payload schemas for route operations. */
export const RegisterRoutesPayloadSchema: z.ZodObject<{
  routes: z.ZodArray<typeof RouteDefinitionSchema>;
  pluginId: z.ZodString;
}> = z.object({
  routes: z.array(RouteDefinitionSchema),
  pluginId: z.string(),
});

export type RegisterRoutesPayload = z.output<
  typeof RegisterRoutesPayloadSchema
>;

export const UnregisterRoutesPayloadSchema: z.ZodObject<{
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  pluginId: z.ZodOptional<z.ZodString>;
}> = z.object({
  paths: z.array(z.string()).optional(),
  pluginId: z.string().optional(),
});

export type UnregisterRoutesPayload = z.output<
  typeof UnregisterRoutesPayloadSchema
>;

export const ListRoutesPayloadSchema: z.ZodObject<{
  pluginId: z.ZodOptional<z.ZodString>;
}> = z.object({
  pluginId: z.string().optional(),
});

export type ListRoutesPayload = z.output<typeof ListRoutesPayloadSchema>;

export const GetRoutePayloadSchema: z.ZodObject<{ path: z.ZodString }> =
  z.object({
    path: z.string(),
  });

export type GetRoutePayload = z.output<typeof GetRoutePayloadSchema>;

export interface RouteOperationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ListRoutesResponse {
  routes: RouteDefinition[];
}

export interface GetRouteResponse {
  route?: RouteDefinition | undefined;
}

/** Navigation item shape for extracted navigation data. */
export const NavigationItemSchema: z.ZodType<NavigationItem> = z.object({
  label: z.string(),
  href: z.string(),
  priority: z.number(),
});
