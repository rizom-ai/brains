export interface RizomShellLink {
  href: string;
  label: string;
}

export interface RizomSideNavItem {
  href: string;
  label: string;
}

export interface RizomFooterTagline {
  prefix?: string;
  link: RizomShellLink;
  suffix?: string;
}

export interface RizomShellModel {
  brandSuffix: "ai" | "foundation" | "work";
  primaryCta: RizomShellLink;
  navLinks: RizomShellLink[];
  footerMetaLabel: string;
  footerTagline?: RizomFooterTagline;
  footerLinks: RizomShellLink[];
  sideNav: RizomSideNavItem[];
}
