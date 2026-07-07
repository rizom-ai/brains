import type { ComponentChildren, JSX } from "preact";

export type RizomThemeProfile = "product" | "editorial" | "studio";

export interface RizomRuntimeConfig {
  themeProfile?: RizomThemeProfile;
  theme?: string;
}

export interface RizomPluginCapabilities {
  tools: [];
  resources: [];
}

export interface RizomMessageBus {
  subscribe(
    channel: string,
    handler: () => Promise<{ success: boolean }>,
  ): unknown;
  send(message: {
    type: string;
    sender: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface RizomLogger {
  info(message: string): void;
}

export interface DataSourceRegistry {
  register(dataSource: unknown): void;
}

export interface RizomSiteShell {
  getMessageBus(): RizomMessageBus;
  getLogger(): RizomLogger;
  registerTemplates(
    templates: Record<string, unknown>,
    namespace?: string,
  ): void;
  getDataSourceRegistry(): DataSourceRegistry;
}

export interface SiteCompositionPlugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
  readonly description?: string | undefined;
  readonly dependencies?: string[] | undefined;
  register?(
    shell: RizomSiteShell,
    context?: unknown,
  ): Promise<RizomPluginCapabilities>;
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
  requiresDaemonStartup?(): boolean;
}

export type ComponentType<P = unknown> = {
  bivarianceHack(props: P): JSX.Element;
}["bivarianceHack"];

export type UserPermissionLevel = "anchor" | "trusted" | "public";

export interface RuntimeScript {
  src: string;
  defer?: boolean;
  module?: boolean;
}

export interface ContentFormatter<T = unknown> {
  format(data: T): string;
  parse(content: string): T;
}

export interface Template {
  name: string;
  description: string;
  schema: unknown;
  requiredPermission: UserPermissionLevel;
  formatter?: ContentFormatter<unknown>;
  layout?: {
    component?: ComponentType<unknown>;
    fullscreen?: boolean;
  };
  runtimeScripts?: RuntimeScript[];
}

export interface DataSource {
  id: string;
  name: string;
  description?: string;
  fetch?<T>(
    query: unknown,
    outputSchema: unknown,
    context: unknown,
  ): Promise<T>;
  generate?<T>(request: unknown, schema: unknown): Promise<T>;
  transform?<T>(content: unknown, format: string, schema: unknown): Promise<T>;
}

export type NavigationSlot = "primary" | "secondary";

export interface EntityDisplayEntry {
  label: string;
  pluralName?: string;
  layout?: string;
  paginate?: boolean;
  pageSize?: number;
  navigation?: {
    show?: boolean;
    slot?: NavigationSlot;
    priority?: number;
  };
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

export interface RouteDefinitionInput {
  id: string;
  path: string;
  title?: string | undefined;
  pageLabel?: string | undefined;
  description?: string | undefined;
  sections?: SectionDefinitionInput[] | undefined;
  layout?: string | undefined;
  fullscreen?: boolean | undefined;
  pluginId?: string | undefined;
  sourceEntityType?: string | undefined;
  external?: boolean | undefined;
  navigation?:
    | {
        show?: boolean | undefined;
        label?: string | undefined;
        slot?: NavigationSlot | undefined;
        priority?: number | undefined;
      }
    | undefined;
}

export interface SitePackage<
  TPluginConfig = Record<string, unknown>,
  TPlugin extends SiteCompositionPlugin = SiteCompositionPlugin,
> {
  layouts: Record<string, unknown>;
  routes: RouteDefinitionInput[];
  plugin: (config?: TPluginConfig) => TPlugin;
  themeOverride?: string;
  entityDisplay: Record<string, EntityDisplayEntry>;
  staticAssets?: Record<string, string>;
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
  heading?: string;
  buttonText?: string;
  buttonLink?: string;
}

export interface SiteMetadataSection {
  blurb?: string;
}

export interface SiteLayoutInfo {
  title: string;
  description: string;
  url?: string;
  copyright: string;
  logo?: boolean;
  themeMode?: "light" | "dark";
  analyticsScript?: string;
  cta?: SiteMetadataCTA;
  sections?: Record<string, SiteMetadataSection>;
  navigation: {
    primary: RizomLink[];
    secondary: RizomLink[];
  };
  socialLinks?: Array<{
    platform: "github" | "instagram" | "linkedin" | "email" | "website";
    url: string;
    label?: string;
  }>;
}

export type RizomBrandSuffix = "ai" | "foundation" | "work";

export interface RizomLink {
  href: string;
  label: string;
  /** Open in a new tab with rel="noopener noreferrer". */
  external?: boolean;
}

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
