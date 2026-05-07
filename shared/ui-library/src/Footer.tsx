import type { JSX, ComponentChildren } from "preact";
import {
  FooterContent,
  type NavigationItem,
  type SocialLink,
} from "@brains/ui-library";

interface FooterProps {
  primaryNavigation: NavigationItem[];
  secondaryNavigation: NavigationItem[];
  copyright?: string | undefined;
  socialLinks?: SocialLink[] | undefined;
  /** Site title for the footer brand block. */
  title?: string | undefined;
  /** Tagline shown beneath the brand wordmark. */
  tagline?: string | undefined;
  /** Content to render at the top of the footer (e.g., slot components) */
  children?: ComponentChildren;
}

export const Footer = ({
  primaryNavigation,
  secondaryNavigation,
  copyright,
  socialLinks,
  title,
  tagline,
  children,
}: FooterProps): JSX.Element => {
  return (
    <footer className="footer pt-14 pb-10 bg-footer border-t border-rule">
      <div className="container mx-auto px-6 max-w-layout">
        <FooterContent
          primaryNav={primaryNavigation}
          secondaryNav={secondaryNavigation}
          copyright={copyright ?? "Powered by Rizom"}
          socialLinks={socialLinks}
          showThemeToggle={true}
          variant="default"
          title={title}
          tagline={tagline}
        >
          {children}
        </FooterContent>
      </div>
    </footer>
  );
};
