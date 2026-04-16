/**
 * Shared Rizom site core.
 *
 * This is the structural base that the app-owned Rizom variants
 * compose from. It currently re-exports the shared Rizom runtime,
 * UI, and ecosystem seams while those packages are being folded
 * into this shared site.
 */
export {
  DefaultRizomLayout,
  RizomRuntimePlugin,
  rizomBaseSite,
  rizomBaseSite as default,
  rizomRuntimeConfigSchema,
  rizomRuntimeStaticAssets,
} from "./runtime";
export type { RizomRuntimeConfig, RizomRuntimeVariant } from "./runtime";

export {
  Badge,
  Button,
  Divider,
  Footer,
  Header,
  ProductCard,
  RizomFrame,
  Section,
  SideNav,
  GUTTER,
} from "./ui";
export type {
  ProductCardContent,
  ProductVariant,
  RizomBrandSuffix,
  RizomFooterTagline,
  RizomLayoutProps,
  RizomLink,
  RizomSideNavItem,
} from "./ui";

export {
  createEcosystemContent,
  ecosystemFormatter,
  EcosystemLayout,
  ecosystemTemplate,
  EcosystemCardSchema,
  EcosystemContentSchema,
  EcosystemSuffixSchema,
} from "./ecosystem";
export type {
  EcosystemCard,
  EcosystemContent,
  EcosystemSuffix,
} from "./ecosystem";
