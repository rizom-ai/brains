import { z } from "@brains/utils";
import type {
  NavigationItem,
  NavigationMetadata,
  RouteDefinition,
  SectionDefinition,
} from "@rizom/site";

export type {
  EntityDisplayEntry,
  NavigationItem,
  NavigationMetadata,
  NavigationSlot,
  RouteDefinition,
  RouteDefinitionInput,
  SectionDefinition,
} from "@rizom/site";

/** Section definition schema for site routes. */
export const SectionDefinitionSchema = z.object({
  id: z.string(),
  template: z.string(),
  content: z.unknown().optional(),
  dataQuery: z
    .object({
      entityType: z.string().optional(),
      template: z.string().optional(),
      query: z
        .object({
          id: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
  order: z.number().optional(),
});

/** Navigation slot types. */
export const NavigationSlots = ["primary", "secondary"] as const;

/** Navigation metadata schema for route definitions. */
export const NavigationMetadataSchema = z
  .object({
    show: z.boolean().default(false),
    label: z.string().optional(),
    slot: z.enum(NavigationSlots).default("primary"),
    priority: z.number().min(0).max(100).default(50),
  })
  .optional();

/** Route definition schema. */
export const RouteDefinitionSchema = z.object({
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

type SectionDefinitionSchemaOutput = z.infer<typeof SectionDefinitionSchema>;
type RouteDefinitionSchemaOutput = z.infer<typeof RouteDefinitionSchema>;
type NavigationMetadataSchemaOutput = z.infer<typeof NavigationMetadataSchema>;

function expectSectionDefinition(
  value: SectionDefinitionSchemaOutput,
): SectionDefinition {
  return value;
}

function expectRouteDefinition(
  value: RouteDefinitionSchemaOutput,
): RouteDefinition {
  return value;
}

function expectNavigationMetadata(
  value: NavigationMetadataSchemaOutput,
): NavigationMetadata | undefined {
  return value;
}

void expectSectionDefinition;
void expectRouteDefinition;
void expectNavigationMetadata;

/** Message payload schemas for route operations. */
export const RegisterRoutesPayloadSchema = z.object({
  routes: z.array(RouteDefinitionSchema),
  pluginId: z.string(),
});

export const UnregisterRoutesPayloadSchema = z.object({
  paths: z.array(z.string()).optional(),
  pluginId: z.string().optional(),
});

export const ListRoutesPayloadSchema = z.object({
  pluginId: z.string().optional(),
});

export const GetRoutePayloadSchema = z.object({
  path: z.string(),
});

export type RegisterRoutesPayload = z.infer<typeof RegisterRoutesPayloadSchema>;
export type UnregisterRoutesPayload = z.infer<
  typeof UnregisterRoutesPayloadSchema
>;
export type ListRoutesPayload = z.infer<typeof ListRoutesPayloadSchema>;
export type GetRoutePayload = z.infer<typeof GetRoutePayloadSchema>;

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
export const NavigationItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  priority: z.number(),
});

type NavigationItemSchemaOutput = z.infer<typeof NavigationItemSchema>;
function expectNavigationItem(
  value: NavigationItemSchemaOutput,
): NavigationItem {
  return value;
}
void expectNavigationItem;
