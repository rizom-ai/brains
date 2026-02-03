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
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer py-8 bg-footer">
      <div className="container mx-auto px-4 max-w-6xl">
        {children && <div className="mb-8">{children}</div>}
        <FooterContent
          primaryNav={primaryNavigation}
          secondaryNav={secondaryNavigation}
          copyright={copyright ?? `Powered by Rizom • © ${currentYear}`}
          socialLinks={socialLinks}
          showThemeToggle={true}
          variant="default"
        />
      </div>
    </footer>
  );
};
