import type { JSX } from "preact";
import {
  Footer,
  Header,
  RizomFrame,
  SideNav,
  type RizomLayoutProps,
} from "@brains/site-rizom";

const NAV_LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#workshop", label: "Workshop" },
  { href: "#ecosystem", label: "Network" },
];

const PRIMARY_CTA = {
  href: "#cta",
  label: "Book a discovery call",
};

const FOOTER_LINKS = [
  { href: "https://rizom.foundation", label: "Foundation" },
  { href: "https://typeform.com", label: "Team Type quiz" },
  {
    href: "https://www.linkedin.com/company/rizom-collective",
    label: "LinkedIn",
  },
  { href: "#cta", label: "Contact" },
];

const SIDE_NAV_ITEMS = [
  { href: "#hero", label: "Intro" },
  { href: "#problem", label: "Problem" },
  { href: "#workshop", label: "Workshop" },
  { href: "#personas", label: "People" },
  { href: "#proof", label: "Proof" },
  { href: "#ownership", label: "About" },
  { href: "#ecosystem", label: "Network" },
];

export const WorkLayout = ({ sections }: RizomLayoutProps): JSX.Element => (
  <RizomFrame>
    <Header brandSuffix="work" navLinks={NAV_LINKS} primaryCta={PRIMARY_CTA} />
    <SideNav items={SIDE_NAV_ITEMS} />
    <main>{sections}</main>
    <Footer
      brandSuffix="work"
      metaLabel="© 2026 · Rizom Collective"
      links={FOOTER_LINKS}
    />
  </RizomFrame>
);
