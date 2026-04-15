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
