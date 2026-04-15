import type { JSX } from "preact";
import {
  Footer,
  Header,
  RizomFrame,
  SideNav,
  type RizomLayoutProps,
} from "@brains/rizom-ui";

const NAV_LINKS = [
  { href: "#research", label: "Research" },
  { href: "#events", label: "Events" },
  { href: "#ecosystem", label: "Ecosystem" },
];

const PRIMARY_CTA = {
  href: "#mission",
  label: "Read Manifesto",
};

const FOOTER_LINKS = [
  { href: "#mission", label: "Newsletter" },
  {
    href: "https://www.linkedin.com/company/rizom-collective",
    label: "LinkedIn",
  },
  { href: "#ecosystem", label: "Ecosystem" },
  { href: "#support", label: "Contact" },
];

const FOOTER_TAGLINE = {
  prefix: "",
  link: { href: "https://rizom.work", label: "Rizom.work" },
  suffix: " runs the TMS workshops and tools that fund this research.",
};

const SIDE_NAV_ITEMS = [
  { href: "#hero", label: "Intro" },
  { href: "#research", label: "Research" },
  { href: "#events", label: "Events" },
  { href: "#ownership", label: "About" },
  { href: "#mission", label: "Follow" },
  { href: "#ecosystem", label: "Network" },
];

export const FoundationLayout = ({
  sections,
}: RizomLayoutProps): JSX.Element => (
  <RizomFrame>
    <Header
      brandSuffix="foundation"
      navLinks={NAV_LINKS}
      primaryCta={PRIMARY_CTA}
    />
    <SideNav items={SIDE_NAV_ITEMS} />
    <main>{sections}</main>
    <Footer
      brandSuffix="foundation"
      metaLabel="© 2026 · Stichting Rizom"
      tagline={FOOTER_TAGLINE}
      links={FOOTER_LINKS}
    />
  </RizomFrame>
);
