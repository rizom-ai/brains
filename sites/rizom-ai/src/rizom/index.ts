/**
 * Package-local Rizom site core.
 *
 * This is the structural base for the consolidated Rizom site. It re-exports
 * the runtime and UI primitives used by the package's site/content layers.
 */
export {
  DefaultRizomLayout,
  rizomBaseSite,
  rizomBaseSite as default,
} from "./runtime";

export { createRizomSite } from "./create-site";
export type { CreateRizomSiteOptions } from "./create-site";
export type { SitePackage } from "./contracts";
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
export { Wordmark, Ecosystem } from "./ui";
export type { WordmarkProps, EcosystemCard, EcosystemContent } from "./ui";
