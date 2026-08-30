import type {
  ComponentType,
  EntityDisplayEntry,
  RouteDefinitionInput,
  RuntimeScript,
  SiteContent,
  SiteLayoutInfo,
  SiteLayoutProps,
  SiteSectionGroup,
  UserPermissionLevel,
} from "@rizom/site";
import type { ReactNode } from "react";

export type {
  ComponentType,
  EntityDisplayEntry,
  NavigationItem,
  NavigationMetadata,
  NavigationSlot,
  RouteDefinition,
  RouteDefinitionInput,
  RuntimeScript,
  SectionDefinition,
  SectionDefinitionInput,
  SiteContent,
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

export interface RizomRuntimeConfig {
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
  layout?:
    | {
        component?: ComponentType<unknown>;
        fullscreen?: boolean;
      }
    | undefined;
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
  content?: SiteContent | undefined;
  sections?: SiteSectionGroup | SiteSectionGroup[] | undefined;
  themeOverride?: string | undefined;
  headScripts?: string[] | undefined;
  entityDisplay: Record<string, EntityDisplayEntry>;
  staticAssets?: Record<string, string> | undefined;
}

// Keeps this module as the source-owned bridge for the current runtime shape;
// the author-facing layout props themselves come from @rizom/site.
export interface RuntimeRizomLayoutProps {
  sections: ReactNode[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
}
