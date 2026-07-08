import { z } from "@brains/utils/zod";

export interface SectionDataQueryParams {
  [key: string]: unknown;
  id?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface SectionDataQuery {
  [key: string]: unknown;
  entityType?: string | undefined;
  template?: string | undefined;
  query?: SectionDataQueryParams | undefined;
}

export interface SectionDefinition {
  id: string;
  template: string;
  content?: unknown;
  dataQuery?: SectionDataQuery | undefined;
  order?: number | undefined;
}

export type SectionDefinitionInput = SectionDefinition;

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
export type NavigationSlot = (typeof NavigationSlots)[number];

/** Display and behavior metadata for an entity type. */
export interface EntityDisplayEntry {
  label: string;
  pluralName?: string | undefined;
  /** Layout name for this entity type's generated routes (defaults to "default") */
  layout?: string | undefined;
  /** Enable pagination for list pages */
  paginate?: boolean | undefined;
  /** Items per page (default: 10) */
  pageSize?: number | undefined;
  navigation?:
    | {
        show?: boolean | undefined;
        slot?: NavigationSlot | undefined;
        priority?: number | undefined;
      }
    | undefined;
}

export interface NavigationMetadata {
  show: boolean;
  label?: string | undefined;
  slot: NavigationSlot;
  priority: number;
}

export interface NavigationMetadataInput {
  show?: boolean | undefined;
  label?: string | undefined;
  slot?: NavigationSlot | undefined;
  priority?: number | undefined;
}

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

export interface RouteDefinition {
  [key: string]: unknown;
  id: string;
  path: string;
  title: string;
  /** Bare display label without any page-suffix. Used for visual headings on list pages. */
  pageLabel?: string | undefined;
  description: string;
  sections: SectionDefinition[];
  layout: string;
  fullscreen?: boolean | undefined;
  pluginId?: string | undefined;
  sourceEntityType?: string | undefined;
  external?: boolean | undefined;
  navigation?: NavigationMetadata | undefined;
}

export interface RouteDefinitionInput {
  [key: string]: unknown;
  id: string;
  path: string;
  title?: string | undefined;
  /** Bare display label without any page-suffix. Used for visual headings on list pages. */
  pageLabel?: string | undefined;
  description?: string | undefined;
  sections?: SectionDefinitionInput[] | undefined;
  layout?: string | undefined;
  fullscreen?: boolean | undefined;
  pluginId?: string | undefined;
  sourceEntityType?: string | undefined;
  external?: boolean | undefined;
  navigation?: NavigationMetadataInput | undefined;
}

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

export interface RegisterRoutesPayload {
  routes: RouteDefinition[];
  pluginId: string;
}

export interface UnregisterRoutesPayload {
  paths?: string[] | undefined;
  pluginId?: string | undefined;
}

export interface ListRoutesPayload {
  pluginId?: string | undefined;
}

export interface GetRoutePayload {
  path: string;
}

/** Message payload schemas for route operations. */
export const RegisterRoutesPayloadSchema: z.ZodType<RegisterRoutesPayload> =
  z.object({
    routes: z.array(RouteDefinitionSchema),
    pluginId: z.string(),
  });

export const UnregisterRoutesPayloadSchema: z.ZodType<UnregisterRoutesPayload> =
  z.object({
    paths: z.array(z.string()).optional(),
    pluginId: z.string().optional(),
  });

export const ListRoutesPayloadSchema: z.ZodType<ListRoutesPayload> = z.object({
  pluginId: z.string().optional(),
});

export const GetRoutePayloadSchema: z.ZodType<GetRoutePayload> = z.object({
  path: z.string(),
});

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

export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

/** Navigation item shape for extracted navigation data. */
export const NavigationItemSchema: z.ZodType<NavigationItem> = z.object({
  label: z.string(),
  href: z.string(),
  priority: z.number(),
});
