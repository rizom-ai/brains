/**
 * Shared Rizom site core.
 *
 * This is the structural base that the app-owned Rizom variants
 * compose from. It re-exports shared Rizom runtime and UI
 * primitives used by the app-owned site/content layers.
 */
export {
  DefaultRizomLayout,
  rizomBaseSite,
  rizomBaseSite as default,
} from "./runtime";

export { createRizomSite } from "./create-site";
export type { CreateRizomSiteOptions } from "./create-site";
export type { RizomThemeProfile } from "./contracts";
export type {
  EntityDisplayEntry,
  RouteDefinitionInput,
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
} from "@rizom/site";
export {
  Badge,
  Button,
  Divider,
  Footer,
  Header,
  RizomFrame,
  Section,
  SideNav,
  socialLinksToRizomLinks,
  renderHighlightedText,
  GUTTER,
} from "./ui";
export type {
  RizomBrandSuffix,
  RizomFooterTagline,
  RizomLayoutProps,
  RizomLink,
  RizomSideNavItem,
} from "./ui";
export type {
  BadgeProps,
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  DividerProps,
  RizomFrameProps,
  SectionProps,
} from "./ui";
export { Wordmark, Ecosystem } from "@rizom/ui";
export type { WordmarkProps, EcosystemCard, EcosystemContent } from "@rizom/ui";
