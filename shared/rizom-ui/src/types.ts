export type RizomBrandSuffix = "ai" | "foundation" | "work";

export interface RizomLink {
  href: string;
  label: string;
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

export type ProductVariant = "rover" | "relay" | "ranger";

export interface ProductCardContent {
  variant: ProductVariant;
  label: string;
  badge: string;
  headline: string;
  description: string;
  tagline?: string[];
  tags: string[];
}
