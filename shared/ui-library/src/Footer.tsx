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
  /** Content to render at the top of the footer (e.g., slot components) */
  children?: ComponentChildren;
}

export const Footer = ({
  primaryNavigation,
  secondaryNavigation,
  copyright,
  socialLinks,
  children,
}: FooterProps): JSX.Element => {
  return (
    <footer className="footer pt-8 sm:pt-14 pb-7 sm:pb-10 bg-footer">
      <div className="container mx-auto px-6 max-w-layout">
        <FooterContent
          primaryNav={primaryNavigation}
          secondaryNav={secondaryNavigation}
          copyright={copyright ?? "Powered by Rizom"}
          socialLinks={socialLinks}
          showThemeToggle={true}
          variant="default"
        >
          {children}
        </FooterContent>
      </div>
    </footer>
  );
};
