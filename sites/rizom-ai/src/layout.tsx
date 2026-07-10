/** @jsxImportSource preact */
import type { ComponentChildren, JSX } from "preact";
import type { SiteLayoutInfo } from "@rizom/site";
import {
  Footer,
  Header,
  RizomFrame,
  SideNav,
  socialLinksToRizomLinks,
} from "@rizom/site-rizom";

interface AiSiteInfo extends Pick<SiteLayoutInfo, "socialLinks"> {
  cta?: {
    buttonLink: string;
    buttonText: string;
  };
  copyright: string;
}

interface AiLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: AiSiteInfo;
}

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
  {
    href: "https://github.com/rizom-ai/brains/tree/main/docs",
    label: "Documentation",
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

export const AiLayout = ({
  sections,
  siteInfo,
}: AiLayoutProps): JSX.Element => (
  <RizomFrame>
    <Header
      brandSuffix="ai"
      navLinks={NAV_LINKS}
      primaryCta={
        siteInfo.cta
          ? {
              href: siteInfo.cta.buttonLink,
              label: siteInfo.cta.buttonText,
            }
          : PRIMARY_CTA
      }
    />
    <SideNav items={SIDE_NAV_ITEMS} />
    <main>{sections}</main>
    <Footer
      brandSuffix="ai"
      metaLabel={siteInfo.copyright}
      links={[
        ...FOOTER_LINKS,
        ...socialLinksToRizomLinks(siteInfo, ["github", "linkedin"]),
      ]}
    />
  </RizomFrame>
);
