export interface RizomShellLink {
  href: string;
  label: string;
}

export interface RizomSideNavItem {
  href: string;
  label: string;
}

export interface RizomShellModel {
  brandSuffix: "ai" | "foundation" | "work";
  primaryCta: RizomShellLink;
  navLinks: RizomShellLink[];
  footerMetaLabel: string;
  footerLinks: RizomShellLink[];
  sideNav: RizomSideNavItem[];
}
