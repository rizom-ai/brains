/** @jsxImportSource preact */
import type { JSX, ComponentChildren } from "preact";
import {
  Footer,
  Header,
  RizomFrame,
  SideNav,
  socialLinksToRizomLinks,
  type RizomLink,
  type SiteLayoutInfo,
} from "@rizom/site-rizom";
import { isNewTabHref, BOOKING_HREF, QUIZ_HREF } from "./link-targets";

interface WorkLayoutProps {
  sections: ComponentChildren;
  siteInfo: Pick<SiteLayoutInfo, "socialLinks"> & {
    copyright?: string;
    cta?: {
      buttonLink: string;
      buttonText: string;
    };
  };
}

const NAV_LINKS: RizomLink[] = [
  { href: "#workshop", label: "Workshop" },
  { href: "#cta", label: "Contact" },
  { href: "#about", label: "About" },
];

const PRIMARY_CTA: RizomLink = {
  href: QUIZ_HREF,
  label: "Take the quiz",
  external: true,
};

const FOOTER_LINKS: RizomLink[] = [
  { href: "#workshop", label: "The workshops" },
  { href: "https://rizom.foundation", label: "The research" },
  { href: "https://rizom.ai", label: "The platform" },
];

const SIDE_NAV_ITEMS = [
  { href: "#hero", label: "Intro" },
  { href: "#problem", label: "Problem" },
  { href: "#workshop", label: "Workshop" },
  { href: "#methodology", label: "Methodology" },
  { href: "#personas", label: "Fit" },
  { href: "#proof", label: "Proof" },
  { href: "#about", label: "About" },
];

export const WorkLayout = ({
  sections,
  siteInfo,
}: WorkLayoutProps): JSX.Element => (
  <RizomFrame>
    <Header
      brandSuffix="work"
      navLinks={NAV_LINKS}
      primaryCta={
        siteInfo.cta
          ? {
              href: siteInfo.cta.buttonLink,
              label: siteInfo.cta.buttonText,
              external: isNewTabHref(siteInfo.cta.buttonLink),
            }
          : PRIMARY_CTA
      }
    />
    <SideNav items={SIDE_NAV_ITEMS} />
    <main>{sections}</main>
    <Footer
      brandSuffix="work"
      metaLabel={siteInfo.copyright ?? ""}
      links={[
        ...FOOTER_LINKS,
        ...socialLinksToRizomLinks(siteInfo, ["linkedin"]),
        { href: BOOKING_HREF, label: "Email", external: true },
      ]}
    />
  </RizomFrame>
);
