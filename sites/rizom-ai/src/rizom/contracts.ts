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

export interface SitePackage {
  layouts: Record<string, unknown>;
  routes: RouteDefinitionInput[];
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
