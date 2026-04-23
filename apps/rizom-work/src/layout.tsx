import type { JSX, ComponentChildren } from "preact";
import { Footer, Header, RizomFrame, SideNav } from "@rizom/ui";

interface WorkLayoutProps {
  sections: ComponentChildren;
  siteInfo: {
    copyright?: string;
    cta?: {
      buttonLink: string;
      buttonText: string;
    };
    socialLinks?: Array<{
      platform: string;
      url: string;
      label?: string;
    }>;
  };
}

interface WorkFooterLink {
  href: string;
  label: string;
}

const DEFAULT_SOCIAL_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  email: "Email",
  website: "Website",
};

function socialLinksToWorkLinks(
  siteInfo: WorkLayoutProps["siteInfo"],
  allowedPlatforms?: string[],
): WorkFooterLink[] {
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
            }
          : PRIMARY_CTA
      }
    />
    <SideNav items={SIDE_NAV_ITEMS} />
    <main>{sections}</main>
    <Footer
      brandSuffix="work"
      metaLabel={siteInfo.copyright ?? ""}
      className="items-center"
      links={[
        ...FOOTER_LINKS,
        ...socialLinksToWorkLinks(siteInfo, ["linkedin"]),
      ]}
    />
  </RizomFrame>
);
