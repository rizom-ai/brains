import type { JSX } from "preact";
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
}

export const Footer = ({
  primaryNavigation,
  secondaryNavigation,
  copyright,
  socialLinks,
}: FooterProps): JSX.Element => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer py-8 bg-footer">
      <div className="container mx-auto px-4 max-w-6xl">
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
