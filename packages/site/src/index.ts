import type { ReactNode, JSX } from "react";
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

/** A route's page head and navigation label in another language. */
export interface RouteTranslation {
  title?: string | undefined;
  description?: string | undefined;
  navigationLabel?: string | undefined;
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
  /** The page's head and navigation label in the site's other languages. */
  translations?: Record<string, RouteTranslation> | undefined;
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
  translations?: Record<string, RouteTranslation> | undefined;
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
  S extends z.ZodType = z.ZodType<JsonObject>,
> extends SectionMeta {
  schema: S;
  component: ComponentType<z.output<S>>;
  /**
   * The section drawn another way in other languages, keyed by language tag:
   * a page in that language renders this component, any other page the
   * default one. Both read the same copy fields.
   */
  components?: Record<string, ComponentType<z.output<S>>> | undefined;
}

/** Concise alias used when declaring heterogeneous section maps. */
export type SectionDefinition<S extends z.ZodType = z.ZodType<JsonObject>> =
  SiteSectionDefinition<S>;

export interface SiteSectionGroup {
  namespace: string;
  sections: Record<string, SiteSectionDefinition>;
}

export type SectionGroup = SiteSectionGroup;

/** Define one JSON-object section contract and its inferred React renderer. */
export function defineSection<S extends z.ZodType>(
  schema: S & JsonObjectOutputGuard<z.output<S>>,
  component: ComponentType<z.output<S>>,
  meta: SectionMeta & {
    components?: Record<string, ComponentType<z.output<S>>> | undefined;
  },
): SiteSectionDefinition<S> {
  for (const language of Object.keys(meta.components ?? {})) {
    if (!languageTagSchema.safeParse(language).success) {
      throw new Error(
        `Section "${meta.title}" draws "${language}", which must be a language tag such as en or zh-TW`,
      );
    }
  }
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
  /** The site's chrome in its other languages, keyed by language tag. */
  translations?: Record<string, SiteMetadataTranslation> | undefined;
}

/** The site's title, description, copyright and call to action in another language. */
export interface SiteMetadataTranslation {
  title?: string | undefined;
  description?: string | undefined;
  copyright?: string | undefined;
  cta?: SiteMetadataCTA | undefined;
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

/** A page in one of the languages it is built in. */
export interface SiteAlternate {
  /** Language tag, such as `en` or `zh-TW`. */
  language: string;
  path: string;
}

/** Props supplied by the site builder to every authored layout. */
export interface SiteLayoutProps {
  sections: ReactNode[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
  /**
   * The page's language. Always set by the site builder; optional so a
   * layout can be rendered on its own.
   */
  language?: string | undefined;
  /**
   * Every language this page is built in, the page's own among them, for a
   * language switch that offers only what exists.
   */
  alternates?: SiteAlternate[] | undefined;
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
  /**
   * The languages the site is built in, as language tags (`en`, `zh-TW`).
   * The first is the default and keeps the routes' own paths; every other
   * language is built under its lowercased tag (`/zh-tw/about`) from copy
   * saved for it. Without it the site is built once, in English.
   */
  languages?: string[] | undefined;
}

export type SiteDefinitionOverrides = {
  [K in keyof SiteDefinition]?: SiteDefinition[K] | undefined;
};

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

const componentSchema: z.ZodCustom<
  ComponentType<SiteLayoutProps>,
  ComponentType<SiteLayoutProps>
> = z.custom<ComponentType<SiteLayoutProps>>(
  (value) => typeof value === "function",
  "Expected a React component",
);

const navigationInputSchema: Strict<{
  show: z.ZodOptional<z.ZodBoolean>;
  label: z.ZodOptional<z.ZodString>;
  slot: z.ZodOptional<
    z.ZodEnum<{ primary: "primary"; secondary: "secondary" }>
  >;
  priority: z.ZodOptional<z.ZodNumber>;
}> = z.strictObject({
  show: z.boolean().optional(),
  label: z.string().min(1).optional(),
  slot: z.enum(NavigationSlots).optional(),
  priority: z.number().optional(),
});

const routeSectionSchema: Strict<{
  id: z.ZodString;
  template: z.ZodString;
  content: z.ZodOptional<z.ZodUnknown>;
  dataQuery: z.ZodOptional<
    z.ZodObject<
      {
        entityType: z.ZodOptional<z.ZodString>;
        template: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
      },
      z.core.$loose
    >
  >;
  order: z.ZodOptional<z.ZodNumber>;
}> = z.strictObject({
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

/** A language tag such as `en` or `zh-TW`. */
export const languageTagSchema: z.ZodString = z
  .string()
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, {
    message: "must be a language tag such as en or zh-TW",
  });

/** A route's page head and navigation label in another language. */
export const routeTranslationSchema: Strict<{
  title: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  navigationLabel: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  title: z.string().optional(),
  description: z.string().optional(),
  navigationLabel: z.string().optional(),
});

const routeInputSchema: Strict<{
  id: z.ZodString;
  path: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  pageLabel: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  sections: z.ZodOptional<z.ZodArray<typeof routeSectionSchema>>;
  layout: z.ZodOptional<z.ZodString>;
  fullscreen: z.ZodOptional<z.ZodBoolean>;
  pluginId: z.ZodOptional<z.ZodString>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
  external: z.ZodOptional<z.ZodBoolean>;
  navigation: z.ZodOptional<typeof navigationInputSchema>;
  translations: z.ZodOptional<
    z.ZodRecord<typeof languageTagSchema, typeof routeTranslationSchema>
  >;
}> = z.strictObject({
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
  translations: z.record(languageTagSchema, routeTranslationSchema).optional(),
});

/**
 * Display and behavior metadata for an entity type, as a site declares it.
 * The one definition: the site-builder takes it as it is.
 */
export const entityDisplaySchema: Strict<{
  label: z.ZodString;
  pluralName: z.ZodOptional<z.ZodString>;
  layout: z.ZodOptional<z.ZodString>;
  detailTemplate: z.ZodOptional<z.ZodString>;
  paginate: z.ZodOptional<z.ZodBoolean>;
  pageSize: z.ZodOptional<z.ZodNumber>;
  citable: z.ZodOptional<z.ZodBoolean>;
  navigation: z.ZodOptional<
    Strict<{
      show: z.ZodOptional<z.ZodBoolean>;
      slot: z.ZodOptional<
        z.ZodEnum<{ primary: "primary"; secondary: "secondary" }>
      >;
      priority: z.ZodOptional<z.ZodNumber>;
    }>
  >;
}> = z.strictObject({
  label: z.string().min(1),
  pluralName: z.string().min(1).optional(),
  /** Layout name for this entity type's generated routes (defaults to "default"). */
  layout: z.string().min(1).optional(),
  /**
   * Template that renders this entity type's detail pages, in place of the
   * plugin's own `<type>-detail` template (e.g. "book:theme" for topics).
   */
  detailTemplate: z.string().min(1).optional(),
  /** Enable pagination for list pages. */
  paginate: z.boolean().optional(),
  /** Items per page (default: 10). */
  pageSize: z.number().int().positive().optional(),
  /**
   * A piece of work a visitor's answer may cite as a source. False always
   * excludes a type. If any type is true, only true entries are candidates;
   * otherwise entries with pages are candidates unless explicitly false.
   * This selects citations, not access permissions.
   */
  citable: z.boolean().optional(),
  navigation: z
    .strictObject({
      show: z.boolean().optional(),
      slot: z.enum(NavigationSlots).optional(),
      priority: z.number().optional(),
    })
    .optional(),
});
export type EntityDisplayEntry = z.output<typeof entityDisplaySchema>;

const sectionDefinitionSchema: Strict<{
  schema: z.ZodCustom<z.ZodType<JsonObject>, z.ZodType<JsonObject>>;
  component: z.ZodCustom<ComponentType<unknown>, ComponentType<unknown>>;
  title: z.ZodString;
  description: z.ZodString;
  requiredPermission: z.ZodOptional<
    z.ZodEnum<{ admin: "admin"; trusted: "trusted"; public: "public" }>
  >;
  fullscreen: z.ZodOptional<z.ZodBoolean>;
}> = z.strictObject({
  // defineSection has already proved JSON output via JsonObjectOutputGuard;
  // this runtime check confirms it is a zod schema, and the declared type
  // carries that proof forward instead of erasing it to unknown.
  schema: z.custom<z.ZodType<JsonObject>>(
    (value) => value instanceof z.ZodType,
    "Expected a Zod schema",
  ),
  component: z.custom<ComponentType<unknown>>(
    (value) => typeof value === "function",
    "Expected a React component",
  ),
  title: z.string().min(1),
  description: z.string(),
  requiredPermission: z.enum(["admin", "trusted", "public"]).optional(),
  fullscreen: z.boolean().optional(),
});

const sectionGroupSchema: Strict<{
  namespace: z.ZodString;
  sections: z.ZodRecord<z.ZodString, typeof sectionDefinitionSchema>;
}> = z.strictObject({
  namespace: z.string().min(1),
  sections: z.record(z.string(), sectionDefinitionSchema),
});

const jsonObjectSchema: z.ZodRecord<
  z.ZodString,
  ReturnType<typeof z.json>
> = z.record(z.string(), z.json());
const siteContentSchema: z.ZodRecord<
  z.ZodString,
  z.ZodRecord<z.ZodString, typeof jsonObjectSchema>
> = z.record(z.string(), z.record(z.string(), jsonObjectSchema));

/**
 * The fields a site definition may carry. Extracted so overrides can be
 * validated as a partial of the same shape rather than asserted into it.
 */
/**
 * Where a page of a site in more than one language lives: the default
 * language keeps the route's own path, every other language puts its
 * lowercased tag in front (`/` → `/zh-tw`, `/about` → `/zh-tw/about`).
 */
export function languagePath(
  language: string,
  defaultLanguage: string,
  path: string,
): string {
  if (language.toLowerCase() === defaultLanguage.toLowerCase()) return path;
  const prefix = `/${language.toLowerCase()}`;
  return path === "/" ? prefix : `${prefix}${path}`;
}

const siteDefinitionShape: {
  layouts: z.ZodRecord<z.ZodString, typeof componentSchema>;
  routes: z.ZodArray<typeof routeInputSchema>;
  content: z.ZodOptional<typeof siteContentSchema>;
  sections: z.ZodOptional<
    z.ZodUnion<
      readonly [
        typeof sectionGroupSchema,
        z.ZodArray<typeof sectionGroupSchema>,
      ]
    >
  >;
  themeOverride: z.ZodOptional<z.ZodString>;
  headScripts: z.ZodOptional<z.ZodArray<z.ZodString>>;
  entityDisplay: z.ZodRecord<z.ZodString, typeof entityDisplaySchema>;
  staticAssets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  languages: z.ZodOptional<z.ZodArray<typeof languageTagSchema>>;
} = {
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
  languages: z.array(languageTagSchema).min(1).optional(),
};

type SiteDefinitionShape = typeof siteDefinitionShape;

/**
 * Validator for a partial site definition — what a conventional `src/site.tsx`
 * exports to extend a base package. Whole-definition invariants (route/layout
 * cross-checks) are deliberately not applied here: they can only be judged
 * once the override has been merged over its base.
 */
export const siteDefinitionOverridesSchema: Strict<{
  [K in keyof SiteDefinitionShape]: z.ZodOptional<SiteDefinitionShape[K]>;
}> = z.strictObject(siteDefinitionShape).partial();

function expectSiteDefinitionOverrides(
  value: z.output<typeof siteDefinitionOverridesSchema>,
): SiteDefinitionOverrides {
  return value;
}
void expectSiteDefinitionOverrides;

/** Canonical runtime validator for structural site definitions. */
export const siteDefinitionSchema: Strict<SiteDefinitionShape> = z
  .strictObject(siteDefinitionShape)
  .superRefine((site, context) => {
    const languages = site.languages ?? [];
    const seenLanguages = new Set<string>();
    for (const [index, language] of languages.entries()) {
      const key = language.toLowerCase();
      if (seenLanguages.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["languages", index],
          message: `Language "${language}" is declared twice`,
        });
      }
      seenLanguages.add(key);
    }
    const translatedPrefixes = languages
      .slice(1)
      .map((language) => `/${language.toLowerCase()}`);

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

      const lowerPath = route.path.toLowerCase();
      const prefix = translatedPrefixes.find(
        (candidate) =>
          lowerPath === candidate || lowerPath.startsWith(`${candidate}/`),
      );
      if (prefix) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "path"],
          message: `Route path "${route.path}" is under ${prefix}, where another language's pages are built`,
        });
      }

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

type SiteDefinitionSchemaOutput = z.output<typeof siteDefinitionSchema>;
function expectSiteDefinition(
  value: SiteDefinitionSchemaOutput,
): SiteDefinition {
  return value;
}
void expectSiteDefinition;

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
