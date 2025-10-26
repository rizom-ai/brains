import type { JSX } from "preact";
import { NavLinks, type NavigationItem } from "@brains/ui-library";

interface FooterProps {
  primaryNavigation: NavigationItem[];
  secondaryNavigation: NavigationItem[];
  copyright?: string;
}

export const Footer = ({
  primaryNavigation,
  secondaryNavigation,
  copyright,
}: FooterProps): JSX.Element => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer py-8 bg-footer">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Navigation links in two rows */}
        <nav className="footer-navigation mb-4 space-y-3">
          {/* Secondary navigation (first row) - meta pages */}
          <NavLinks
            items={secondaryNavigation}
            linkClassName="text-theme-inverse hover:text-brand-light transition-colors text-sm"
          />
          {/* Primary navigation (second row) - content */}
          <NavLinks
            items={primaryNavigation}
            linkClassName="text-theme-inverse hover:text-brand-light transition-colors text-sm"
          />
        </nav>

        {/* Simple credit line */}
        <div className="text-center">
          <p className="text-sm text-theme-inverse">
            {copyright ?? `Powered by Rizom • © ${currentYear}`}
          </p>
        </div>
      </div>
    </footer>
  );
};
