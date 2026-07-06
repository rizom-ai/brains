/** @jsxImportSource preact */
import type { JSX, ComponentChildren } from "preact";
import { RizomFrame, SideNav, Wordmark } from "@rizom/site-rizom";
import { newTabProps } from "./link-targets";

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
  { href: "#workshop", label: "Workshop" },
  { href: "#cta", label: "Contact" },
  { href: "#about", label: "About" },
];

const PRIMARY_CTA = {
  href: "https://form.typeform.com/to/NGqo9Fnf",
  label: "Take the quiz",
};

const FOOTER_LINKS = [
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

const HEADER_LINK_CLS =
  "hidden md:inline-block font-body text-[15px] text-theme-muted hover:text-theme transition-colors relative py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-px after:w-0 after:bg-accent after:transition-all after:duration-300 hover:after:w-full";

const FOOTER_LINK_CLS =
  "text-label-md text-theme-light hover:text-theme transition-colors";

const FOOTER_TOGGLE_CLS =
  "bg-transparent border border-theme-light rounded-md px-2.5 py-1.5 cursor-pointer text-theme-light text-label-md font-body transition-colors hover:text-theme hover:border-theme";

const WorkHeader = ({
  primaryCta,
}: {
  primaryCta: WorkFooterLink;
}): JSX.Element => (
  <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between bg-nav-fade px-6 py-4 backdrop-blur-[8px] md:px-10 md:py-5 xl:px-20">
    <Wordmark brandSuffix="work" className="text-[22px]" />
    <div className="flex items-center gap-3 md:gap-8">
      {NAV_LINKS.map((link) => (
        <a key={link.href} href={link.href} className={HEADER_LINK_CLS}>
          {link.label}
        </a>
      ))}
      <a
        href={primaryCta.href}
        {...newTabProps(primaryCta.href)}
        className="font-body text-[13px] font-semibold text-theme border border-theme rounded-[8px] px-4 py-2 transition-colors hover:border-accent hover:text-accent md:px-6 md:py-2.5 md:text-[15px]"
      >
        {primaryCta.label}
      </a>
    </div>
  </nav>
);

const WorkFooter = ({
  metaLabel,
  links,
}: {
  metaLabel: string;
  links: WorkFooterLink[];
}): JSX.Element => (
  <footer className="flex flex-col gap-4 px-6 md:px-10 xl:px-20 py-8 md:flex-row md:items-center md:justify-between md:gap-6 md:py-6 border-t border-theme-light text-center md:text-left items-center">
    <div className="flex flex-col items-center gap-1.5 md:items-start max-w-[560px]">
      <div className="flex flex-col items-center gap-1.5 md:flex-row md:items-center md:gap-3">
        <Wordmark brandSuffix="work" className="text-[16px]" />
        <span className="text-label-md text-theme-light">{metaLabel}</span>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end md:gap-6">
      {links.map((link) => (
        <a
          key={link.href + link.label}
          href={link.href}
          {...newTabProps(link.href)}
          className={FOOTER_LINK_CLS}
        >
          {link.label}
        </a>
      ))}
      <button
        id="themeToggle"
        aria-label="Toggle light mode"
        className={FOOTER_TOGGLE_CLS}
      >
        ☀ Light
      </button>
    </div>
  </footer>
);

export const WorkLayout = ({
  sections,
  siteInfo,
}: WorkLayoutProps): JSX.Element => (
  <RizomFrame>
    <WorkHeader
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
    <WorkFooter
      metaLabel={siteInfo.copyright ?? ""}
      links={[
        ...FOOTER_LINKS,
        ...socialLinksToWorkLinks(siteInfo, ["linkedin"]),
        { href: "mailto:contact@rizom.ai", label: "Email" },
      ]}
    />
  </RizomFrame>
);
