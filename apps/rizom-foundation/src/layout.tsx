import type { ComponentChildren, JSX } from "preact";
import { Footer, Header, RizomFrame, SideNav, type RizomLink } from "@rizom/ui";

interface FoundationSiteInfo {
  cta?: {
    buttonLink: string;
    buttonText: string;
  };
  copyright: string;
  socialLinks?: Array<{
    platform: string;
    url: string;
    label?: string;
  }>;
}

interface FoundationLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: FoundationSiteInfo;
}

const DEFAULT_SOCIAL_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  email: "Email",
  website: "Website",
};

function socialLinksToFoundationLinks(
  siteInfo: FoundationSiteInfo,
  allowedPlatforms?: string[],
): RizomLink[] {
  const allowed = allowedPlatforms ? new Set(allowedPlatforms) : undefined;

  return (siteInfo.socialLinks ?? [])
    .filter((link) => (allowed ? allowed.has(link.platform) : true))
    .map((link) => ({
      href: link.url,
      label:
        link.label ?? DEFAULT_SOCIAL_LABELS[link.platform] ?? link.platform,
    }));
}

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
  siteInfo,
}: FoundationLayoutProps): JSX.Element => (
  <RizomFrame>
    <Header
      brandSuffix="foundation"
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
      brandSuffix="foundation"
      metaLabel={siteInfo.copyright}
      tagline={FOOTER_TAGLINE}
      links={[
        ...FOOTER_LINKS,
        ...socialLinksToFoundationLinks(siteInfo, ["linkedin"]),
      ]}
    />
  </RizomFrame>
);
