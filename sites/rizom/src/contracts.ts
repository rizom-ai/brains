import type {
  ComponentType,
  EntityDisplayEntry,
  RouteDefinitionInput,
  RuntimeScript,
  SiteContentDefinition,
  SiteLayoutInfo,
  UserPermissionLevel,
} from "@rizom/site";
import type { ComponentChildren } from "preact";

export type {
  ComponentType,
  EntityDisplayEntry,
  NavigationItem,
  NavigationMetadata,
  NavigationSlot,
  RizomBrandSuffix,
  RizomFooterTagline,
  RizomLayoutProps,
  RizomLink,
  RizomSideNavItem,
  RouteDefinition,
  RouteDefinitionInput,
  RuntimeScript,
  SectionDefinition,
  SectionDefinitionInput,
  SiteContentArrayFieldDefinition,
  SiteContentDefinition,
  SiteContentEnumFieldDefinition,
  SiteContentFieldDefinition,
  SiteContentNumberFieldDefinition,
  SiteContentObjectFieldDefinition,
  SiteContentSectionDefinition,
  SiteContentStringFieldDefinition,
  SiteDefinition,
  SiteDefinitionOverrides,
  SiteLayoutInfo,
  SiteMetadata,
  SiteMetadataCTA,
  SiteMetadataSection,
  UserPermissionLevel,
} from "@rizom/site";
export { NavigationSlots } from "@rizom/site";

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

export interface SitePackage<
  TPluginConfig = Record<string, unknown>,
  TPlugin extends SiteCompositionPlugin = SiteCompositionPlugin,
> {
  layouts: Record<string, unknown>;
  routes: RouteDefinitionInput[];
  plugin?: ((config?: TPluginConfig) => TPlugin) | undefined;
  content?: SiteContentDefinition | SiteContentDefinition[];
  themeOverride?: string;
  headScripts?: string[];
  entityDisplay: Record<string, EntityDisplayEntry>;
  staticAssets?: Record<string, string>;
}

// Keeps this module as the source-owned bridge for the current runtime shape;
// the author-facing layout props themselves come from @rizom/site.
export interface RuntimeRizomLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
}
