/**
 * Shared Rizom site core.
 *
 * This is the structural base that the app-owned Rizom variants
 * compose from. It re-exports shared Rizom runtime and UI
 * primitives used by the app-owned site/content layers.
 */
export {
  DefaultRizomLayout,
  RizomRuntimePlugin,
  rizomBaseSite,
  rizomBaseSite as default,
  rizomRuntimeConfigSchema,
  rizomRuntimeStaticAssets,
} from "./runtime";
export type { RizomRuntimeConfig, RizomThemeProfile } from "./runtime";

export { createRizomSite } from "./create-site";
export type { CreateRizomSiteOptions } from "./create-site";

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
