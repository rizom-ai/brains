import type { RizomShellModel } from "@brains/site-rizom";

export const foundationShellModel: RizomShellModel = {
  brandSuffix: "foundation",
  primaryCta: {
    href: "#mission",
    label: "Read Manifesto",
  },
  navLinks: [
    { href: "#research", label: "Research" },
    { href: "#events", label: "Events" },
    { href: "#ecosystem", label: "Ecosystem" },
  ],
  footerMetaLabel: "© 2026 · Stichting Rizom",
  footerTagline: {
    prefix: "",
    link: { href: "https://rizom.work", label: "Rizom.work" },
    suffix: " runs the TMS workshops and tools that fund this research.",
  },
  footerLinks: [
    { href: "#mission", label: "Newsletter" },
    { href: "#", label: "LinkedIn" },
    { href: "#ecosystem", label: "Ecosystem" },
    { href: "#support", label: "Contact" },
  ],
  sideNav: [
    { href: "#hero", label: "Intro" },
    { href: "#research", label: "Research" },
    { href: "#events", label: "Events" },
    { href: "#ownership", label: "About" },
    { href: "#mission", label: "Follow" },
    { href: "#ecosystem", label: "Network" },
  ],
};
