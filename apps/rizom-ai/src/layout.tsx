import type { JSX } from "preact";
import {
  Footer,
  Header,
  RizomFrame,
  SideNav,
  type RizomLayoutProps,
} from "@brains/site-rizom";

const NAV_LINKS = [
  { href: "#problem", label: "Platform" },
  { href: "#quickstart", label: "Docs" },
  { href: "#ecosystem", label: "Network" },
];

const PRIMARY_CTA = {
  href: "#quickstart",
  label: "Get Started",
};

const FOOTER_LINKS = [
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
];

const SIDE_NAV_ITEMS = [
  { href: "#hero", label: "Intro" },
  { href: "#problem", label: "Problem" },
  { href: "#answer", label: "Answer" },
  { href: "#ownership", label: "Open" },
  { href: "#quickstart", label: "Start" },
  { href: "#mission", label: "Vision" },
  { href: "#ecosystem", label: "Network" },
];

export const AiLayout = ({ sections }: RizomLayoutProps): JSX.Element => (
  <RizomFrame>
    <Header brandSuffix="ai" navLinks={NAV_LINKS} primaryCta={PRIMARY_CTA} />
    <SideNav items={SIDE_NAV_ITEMS} />
    <main>{sections}</main>
    <Footer
      brandSuffix="ai"
      metaLabel="© 2026 · Apache-2.0"
      links={FOOTER_LINKS}
    />
  </RizomFrame>
);
