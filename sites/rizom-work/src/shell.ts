import type { RizomShellModel } from "@brains/site-rizom";

export const workShellModel: RizomShellModel = {
  brandSuffix: "work",
  primaryCta: {
    href: "#cta",
    label: "Book a discovery call",
  },
  navLinks: [
    { href: "#problem", label: "Problem" },
    { href: "#workshop", label: "Workshop" },
    { href: "#ecosystem", label: "Network" },
  ],
  footerMetaLabel: "© 2026 · Rizom Collective",
  footerLinks: [
    { href: "https://rizom.foundation", label: "Foundation" },
    { href: "https://typeform.com", label: "Team Type quiz" },
    { href: "#cta", label: "Book a call" },
    { href: "#ecosystem", label: "Network" },
  ],
  sideNav: [
    { href: "#hero", label: "Intro" },
    { href: "#problem", label: "Problem" },
    { href: "#workshop", label: "Workshop" },
    { href: "#personas", label: "People" },
    { href: "#proof", label: "Proof" },
    { href: "#ownership", label: "About" },
  ],
};
