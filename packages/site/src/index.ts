import type { ComponentChildren, JSX } from "preact";
import { z } from "zod/v4";

/** The blessed schema vocabulary for site authors. */
export { z };

/** Permission levels for editable site content templates. */
export type UserPermissionLevel = "admin" | "trusted" | "public";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

/** A JSON document with an object at its root. */
export interface JsonObject {
  [key: string]: JsonValue;
}

type IsJsonValueMember<
  T,
  Depth extends readonly unknown[],
> = T extends JsonPrimitive
  ? true
  : T extends readonly (infer Item)[]
    ? IsJsonValue<Item, [...Depth, unknown]>
    : T extends (...args: never[]) => unknown
      ? false
      : T extends object
        ? [keyof T] extends [never]
          ? false
          : string extends keyof T
            ? T extends JsonObject
              ? true
              : false
            : false extends {
                  [K in keyof T]-?: IsJsonValue<T[K], [...Depth, unknown]>;
                }[keyof T]
              ? false
              : true
        : false;

/**
 * Whether a type is composed entirely of JSON values.
 * Types deeper than 32 levels fail closed to cap compiler recursion.
 */
export type IsJsonValue<
  T,
  Depth extends readonly unknown[] = [],
> = Depth["length"] extends 32
  ? false
  : undefined extends T
    ? false
    : false extends IsJsonValueMember<T, Depth>
      ? false
      : true;

/** Resolves to `unknown` for JSON-object output without `undefined`, else `never`. */
export type JsonObjectOutputGuard<T> = [T] extends [readonly unknown[]]
  ? never
  : [T] extends [object]
    ? IsJsonValue<T> extends true
      ? unknown
      : never
    : never;

/** Runtime script declaration attached to a content section/template. */
export interface RuntimeScript {
  src: string;
  defer?: boolean;
  module?: boolean;
}

/** Bivariant component type for author-supplied layout components. */
export type ComponentType<P = unknown> = {
  bivarianceHack(props: P): JSX.Element;
}["bivarianceHack"];

/** Navigation slot types exposed to authored routes and generated entity routes. */
export type NavigationSlot = "primary" | "secondary";

export const NavigationSlots: readonly NavigationSlot[] = [
  "primary",
  "secondary",
];

/** Display and behavior metadata for an entity type. */
export interface EntityDisplayEntry {
  label: string;
  pluralName?: string | undefined;
  /** Layout name for this entity type's generated routes (defaults to "default"). */
  layout?: string | undefined;
  /** Enable pagination for list pages. */
  paginate?: boolean | undefined;
  /** Items per page (default: 10). */
  pageSize?: number | undefined;
  navigation?:
    | {
        show?: boolean | undefined;
        slot?: NavigationSlot | undefined;
        priority?: number | undefined;
      }
    | undefined;
}

export interface SectionDefinitionInput {
  id: string;
  template: string;
  content?: unknown;
  dataQuery?:
    | {
        entityType?: string | undefined;
        template?: string | undefined;
        query?: Record<string, unknown> | undefined;
        [key: string]: unknown;
      }
    | undefined;
  order?: number | undefined;
}

export type RouteSectionDefinition = SectionDefinitionInput;

export interface NavigationMetadataInput {
  show?: boolean | undefined;
  label?: string | undefined;
  slot?: NavigationSlot | undefined;
  priority?: number | undefined;
}

export interface NavigationMetadata {
  show: boolean;
  label?: string | undefined;
  slot: NavigationSlot;
  priority: number;
}

export interface RouteDefinitionInput {
  id: string;
  path: string;
  title?: string | undefined;
  /** Bare display label without any page suffix. */
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

export interface RouteDefinition {
  id: string;
  path: string;
  title: string;
  pageLabel?: string | undefined;
  description: string;
  sections: RouteSectionDefinition[];
  layout: string;
  fullscreen?: boolean | undefined;
  pluginId?: string | undefined;
  sourceEntityType?: string | undefined;
  external?: boolean | undefined;
  navigation?: NavigationMetadata | undefined;
}

export interface SiteContentStringFieldDefinition {
  type: "string";
  label: string;
  optional?: boolean;
}

export interface SiteContentNumberFieldDefinition {
  type: "number";
  label: string;
  optional?: boolean;
}

export interface SiteContentEnumFieldDefinition {
  type: "enum";
  label: string;
  options: [string, ...string[]] | readonly [string, ...string[]];
  optional?: boolean;
}

export interface SiteContentObjectFieldDefinition {
  type: "object";
  label: string;
  fields: Record<string, SiteContentFieldDefinition>;
  optional?: boolean;
}

export interface SiteContentArrayFieldDefinition {
  type: "array";
  label: string;
  items:
    | SiteContentStringFieldDefinition
    | SiteContentNumberFieldDefinition
    | SiteContentEnumFieldDefinition
    | SiteContentObjectFieldDefinition;
  minItems?: number;
  length?: number;
  optional?: boolean;
}

export type SiteContentFieldDefinition =
  | SiteContentStringFieldDefinition
  | SiteContentNumberFieldDefinition
  | SiteContentEnumFieldDefinition
  | SiteContentObjectFieldDefinition
  | SiteContentArrayFieldDefinition;

export interface SiteContentSectionDefinition {
  description: string;
  title: string;
  layout: ComponentType<unknown>;
  fields: Record<string, SiteContentFieldDefinition>;
  requiredPermission?: UserPermissionLevel;
  fullscreen?: boolean;
  runtimeScripts?: RuntimeScript[];
}

export interface SiteContentDefinition {
  namespace: string;
  sections: Record<string, SiteContentSectionDefinition>;
}

/** Author-facing metadata for a schema-first content section. */
export interface SectionMeta {
  title: string;
  description: string;
  requiredPermission?: UserPermissionLevel | undefined;
  fullscreen?: boolean | undefined;
}

/**
 * A schema-first content section. Its component props are inferred from the
 * same schema used by runtime validation, markdown formatting, and editing.
 */
export interface SiteSectionDefinition<
  S extends z.ZodType = z.ZodType,
> extends SectionMeta {
  schema: S;
  component: ComponentType<z.output<S>>;
}

/** Concise alias used when declaring heterogeneous section maps. */
export type SectionDefinition<S extends z.ZodType = z.ZodType> =
  SiteSectionDefinition<S>;

export interface SiteSectionGroup {
  namespace: string;
  sections: Record<string, SiteSectionDefinition>;
}

export type SectionGroup = SiteSectionGroup;

/** Define one JSON-object section contract and its inferred Preact renderer. */
export function defineSection<S extends z.ZodType>(
  schema: S & JsonObjectOutputGuard<z.output<S>>,
  component: ComponentType<z.output<S>>,
  meta: SectionMeta,
): SiteSectionDefinition<S> {
  return Object.freeze({ schema, component, ...meta });
}

/** Group section definitions under the namespace used by route templates. */
export function sectionGroup(
  namespace: string,
  sections: Record<string, SiteSectionDefinition>,
): SiteSectionGroup {
  if (!namespace.trim()) {
    throw new Error("Section group namespace must not be empty");
  }
  if (Object.keys(sections).length === 0) {
    throw new Error(`Section group "${namespace}" must contain a section`);
  }
  return Object.freeze({
    namespace,
    sections: Object.freeze({ ...sections }),
  });
}

export interface SiteMetadataCTA {
  heading: string;
  buttonText: string;
  buttonLink: string;
}

export interface SiteMetadataSection {
  blurb?: string | undefined;
}

export interface SiteMetadata {
  represents?: "brain" | "anchor" | undefined;
  title: string;
  description: string;
  url?: string | undefined;
  copyright?: string | undefined;
  logo?: boolean | undefined;
  themeMode?: "light" | "dark" | undefined;
  analyticsScript?: string | undefined;
  cta?: SiteMetadataCTA | undefined;
  sections?: Record<string, SiteMetadataSection> | undefined;
}

export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

export interface SiteLayoutInfo extends SiteMetadata {
  copyright: string;
  navigation: {
    primary: NavigationItem[];
    secondary: NavigationItem[];
  };
  socialLinks?:
    | Array<{
        platform: "github" | "instagram" | "linkedin" | "email" | "website";
        url: string;
        label?: string | undefined;
      }>
    | undefined;
}

/** Props supplied by the site builder to every authored layout. */
export interface SiteLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
}

/** Initial section content keyed by section-group namespace and section id. */
export interface SiteContent {
  [namespace: string]: Record<string, JsonObject>;
}

/** Declarative site-package shape authored by public site packages. */
export interface SiteDefinition {
  /** Layout components keyed by name — a `default` layout is required. */
  layouts: Record<string, ComponentType<SiteLayoutProps>>;
  /** Hand-written route definitions (home, about, etc.). */
  routes: RouteDefinitionInput[];
  /** Optional initial content validated by the corresponding section schema. */
  content?: SiteContent | undefined;
  /** Optional schema-first section groups. */
  sections?: SiteSectionGroup | SiteSectionGroup[] | undefined;
  /** Optional additive CSS owned by the site package. */
  themeOverride?: string | undefined;
  /** Global head scripts to inject into every rendered page. */
  headScripts?: string[] | undefined;
  /** Display metadata per entity type. */
  entityDisplay: Record<string, EntityDisplayEntry>;
  /** Static assets to write into the site output directory at build time. */
  staticAssets?: Record<string, string> | undefined;
}

export type SiteDefinitionOverrides = Partial<SiteDefinition>;

export interface RizomLink {
  href: string;
  label: string;
  /** Open in a new tab with rel="noopener noreferrer". */
  external?: boolean;
}

export type RizomBrandSuffix = "ai" | "foundation" | "work";

export interface RizomSideNavItem {
  href: string;
  label: string;
}

export interface RizomFooterTagline {
  prefix?: string;
  link: RizomLink;
  suffix?: string;
}

export type RizomLayoutProps = SiteLayoutProps;

const componentSchema = z.custom<ComponentType<SiteLayoutProps>>(
  (value) => typeof value === "function",
  "Expected a Preact component",
);

const navigationInputSchema = z.strictObject({
  show: z.boolean().optional(),
  label: z.string().min(1).optional(),
  slot: z.enum(NavigationSlots).optional(),
  priority: z.number().optional(),
});

const routeSectionSchema = z.strictObject({
  id: z.string().min(1),
  template: z.string().min(1),
  content: z.unknown().optional(),
  dataQuery: z
    .looseObject({
      entityType: z.string().optional(),
      template: z.string().optional(),
      query: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  order: z.number().optional(),
});

const routeInputSchema = z.strictObject({
  id: z.string().min(1),
  path: z.string().startsWith("/"),
  title: z.string().optional(),
  pageLabel: z.string().optional(),
  description: z.string().optional(),
  sections: z.array(routeSectionSchema).optional(),
  layout: z.string().min(1).optional(),
  fullscreen: z.boolean().optional(),
  pluginId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  external: z.boolean().optional(),
  navigation: navigationInputSchema.optional(),
});

const entityDisplaySchema = z.strictObject({
  label: z.string().min(1),
  pluralName: z.string().min(1).optional(),
  layout: z.string().min(1).optional(),
  paginate: z.boolean().optional(),
  pageSize: z.number().int().positive().optional(),
  navigation: z
    .strictObject({
      show: z.boolean().optional(),
      slot: z.enum(NavigationSlots).optional(),
      priority: z.number().optional(),
    })
    .optional(),
});

const sectionDefinitionSchema = z.strictObject({
  schema: z.custom<z.ZodType>(
    (value) => value instanceof z.ZodType,
    "Expected a Zod schema",
  ),
  component: z.custom<ComponentType<unknown>>(
    (value) => typeof value === "function",
    "Expected a Preact component",
  ),
  title: z.string().min(1),
  description: z.string(),
  requiredPermission: z.enum(["admin", "trusted", "public"]).optional(),
  fullscreen: z.boolean().optional(),
});

const sectionGroupSchema = z.strictObject({
  namespace: z.string().min(1),
  sections: z.record(z.string(), sectionDefinitionSchema),
});

const jsonObjectSchema = z.record(z.string(), z.json());
const siteContentSchema = z.record(
  z.string(),
  z.record(z.string(), jsonObjectSchema),
);

/** Canonical runtime validator for structural site definitions. */
export const siteDefinitionSchema: z.ZodType<SiteDefinition> = z
  .strictObject({
    layouts: z
      .record(z.string(), componentSchema)
      .refine((layouts) => typeof layouts["default"] === "function", {
        message: 'Site layouts must include a "default" component',
      }),
    routes: z.array(routeInputSchema),
    content: siteContentSchema.optional(),
    sections: z
      .union([sectionGroupSchema, z.array(sectionGroupSchema)])
      .optional(),
    themeOverride: z.string().optional(),
    headScripts: z.array(z.string()).optional(),
    entityDisplay: z.record(z.string(), entityDisplaySchema),
    staticAssets: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((site, context) => {
    const routeIds = new Set<string>();
    for (const [index, route] of site.routes.entries()) {
      if (routeIds.has(route.id)) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "id"],
          message: `Duplicate route id "${route.id}"`,
        });
      }
      routeIds.add(route.id);

      const layout = route.layout ?? "default";
      if (!site.layouts[layout]) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "layout"],
          message: `Unknown layout "${layout}"`,
        });
      }
    }

    const groups = Array.isArray(site.sections)
      ? site.sections
      : site.sections
        ? [site.sections]
        : [];
    const groupsByNamespace = new Map(
      groups.map((group) => [group.namespace, group] as const),
    );
    if (groupsByNamespace.size !== groups.length) {
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Section group namespaces must be unique",
      });
    }

    for (const [namespace, sections] of Object.entries(site.content ?? {})) {
      const group = groupsByNamespace.get(namespace);
      if (!group) {
        context.addIssue({
          code: "custom",
          path: ["content", namespace],
          message: `Content namespace "${namespace}" has no section group`,
        });
        continue;
      }
      for (const [sectionId, content] of Object.entries(sections)) {
        const section = group.sections[sectionId];
        if (!section) {
          context.addIssue({
            code: "custom",
            path: ["content", namespace, sectionId],
            message: `Content section "${namespace}.${sectionId}" is not defined`,
          });
          continue;
        }
        const parsed = section.schema.safeParse(content);
        if (!parsed.success) {
          context.addIssue({
            code: "custom",
            path: ["content", namespace, sectionId],
            message: `Content does not satisfy the "${namespace}.${sectionId}" schema: ${z.prettifyError(parsed.error)}`,
          });
        }
      }
    }
  });

function runtimeTemplateName(template: string): {
  readonly name: string;
  readonly namespace?: string | undefined;
  readonly sectionId?: string | undefined;
} {
  const parts = template.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { name: template };
  }
  return {
    name: `${parts[0]}:${parts[1]}`,
    namespace: parts[0],
    sectionId: parts[1],
  };
}

/**
 * Validate and normalize a public site definition. Dotted schema-first
 * template names become the runtime namespace form, and declared initial
 * content becomes the route section's typed fallback.
 */
export function defineSite(definition: SiteDefinition): SiteDefinition {
  const parsed = siteDefinitionSchema.parse(definition);
  const routes = parsed.routes.map((route): RouteDefinitionInput => ({
    ...route,
    ...(route.sections
      ? {
          sections: route.sections.map((section): SectionDefinitionInput => {
            const template = runtimeTemplateName(section.template);
            const initialContent =
              template.namespace && template.sectionId
                ? parsed.content?.[template.namespace]?.[template.sectionId]
                : undefined;
            return {
              ...section,
              template: template.name,
              ...(section.content === undefined && initialContent !== undefined
                ? { content: initialContent }
                : {}),
            };
          }),
        }
      : {}),
  }));

  return Object.freeze({
    ...parsed,
    layouts: Object.freeze({ ...parsed.layouts }),
    routes,
    entityDisplay: Object.freeze({ ...parsed.entityDisplay }),
  });
}
