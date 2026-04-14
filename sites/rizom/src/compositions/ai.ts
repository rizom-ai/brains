import type { RizomShellModel } from "./types";

export const aiShellModel: RizomShellModel = {
  brandSuffix: "ai",
  primaryCta: {
    href: "#quickstart",
    label: "Get Started",
  },
  navLinks: [
    { href: "#problem", label: "Platform" },
    { href: "#quickstart", label: "Docs" },
    { href: "#ecosystem", label: "Network" },
  ],
  footerMetaLabel: "© 2026 · Apache-2.0",
  footerLinks: [
    { href: "https://github.com/rizom-ai/brains", label: "GitHub" },
    {
      href: "https://github.com/rizom-ai/brains/tree/main/docs",
      label: "Documentation",
    },
    { href: "#", label: "Discord" },
    {
      href: "https://www.linkedin.com/company/rizom-collective",
      label: "LinkedIn",
    },
  ],
  sideNav: [
    { href: "#hero", label: "Intro" },
    { href: "#problem", label: "Problem" },
    { href: "#answer", label: "Answer" },
    { href: "#ownership", label: "Open" },
    { href: "#quickstart", label: "Start" },
    { href: "#mission", label: "Vision" },
    { href: "#ecosystem", label: "Network" },
  ],
};
