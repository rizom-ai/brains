import type { ComponentChildren, JSX } from "preact";

/** Permission levels for editable site content templates. */
export type UserPermissionLevel = "anchor" | "trusted" | "public";

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

export type SectionDefinition = SectionDefinitionInput;

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
  sections: SectionDefinition[];
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

export interface SiteMetadataCTA {
  heading: string;
  buttonText: string;
  buttonLink: string;
}

export interface SiteMetadataSection {
  blurb?: string | undefined;
}

export interface SiteMetadata {
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

/** Declarative site-package shape authored by public site packages. */
export interface SiteDefinition {
  /** Layout components keyed by name — at minimum "default" is required. */
  layouts: Record<string, unknown>;
  /** Hand-written route definitions (home, about, etc.). */
  routes: RouteDefinitionInput[];
  /** Optional content definitions owned by this package. */
  content?: SiteContentDefinition | SiteContentDefinition[];
  /** Optional additive CSS owned by the site package. */
  themeOverride?: string;
  /** Global head scripts to inject into every rendered page. */
  headScripts?: string[];
  /** Display metadata per entity type. */
  entityDisplay: Record<string, EntityDisplayEntry>;
  /** Static assets to write into the site output directory at build time. */
  staticAssets?: Record<string, string>;
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

export interface RizomLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
}
