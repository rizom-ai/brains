export { RizomFrame } from "./frame";
export type { RizomFrameProps, RizomLayoutProps } from "./frame";
export { Header } from "./Header";
export { Footer } from "./Footer";
export { SideNav } from "./SideNav";
export { Section, GUTTER } from "./Section";
export type { SectionProps } from "./Section";
export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";
export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";
export { Divider } from "./Divider";
export type { DividerProps } from "./Divider";
import { renderHighlightedText as renderSharedHighlightedText } from "@rizom/brain-ui";
import type { JSX } from "react";

// The implementation is bundled; the Site declaration stays React-only and
// does not require a Core-lane package in its consumer's type graph.
export const renderHighlightedText: (
  text: string,
  highlightClass: string,
) => JSX.Element = renderSharedHighlightedText;
export { socialLinksToRizomLinks } from "./site-info-links";
export type {
  RizomBrandSuffix,
  RizomFooterTagline,
  RizomLink,
  RizomSideNavItem,
} from "./types";
export { Wordmark } from "./Wordmark";
export type { WordmarkProps } from "./Wordmark";
export { Ecosystem } from "./Ecosystem";
export type { EcosystemCard, EcosystemContent } from "./Ecosystem";
export {
  getRizomEcosystemContent,
  rizomEcosystemContent,
} from "./ecosystem-content";
