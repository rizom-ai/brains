import type { JSX } from "preact";
import { SocialLinks, ThemeToggle, type SocialLink } from "@brains/ui-library";
import { WavyDivider } from "./WavyDivider";

interface CompactFooterProps {
  copyright?: string | undefined;
  socialLinks?: SocialLink[] | undefined;
}

export const CompactFooter = ({
  copyright,
  socialLinks,
}: CompactFooterProps): JSX.Element => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer bg-theme">
      <WavyDivider mirror />

      <div className="container mx-auto px-6 md:px-12 max-w-4xl py-12">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
          {/* Copyright */}
          <div className="text-sm text-theme-muted text-center sm:text-left">
            {copyright ?? `© ${currentYear}`}
          </div>

          {/* Theme Toggle & Social Links */}
          <div className="flex items-center gap-6">
            <ThemeToggle variant="footer" size="sm" />
            {socialLinks && socialLinks.length > 0 && (
              <SocialLinks
                links={socialLinks}
                iconClassName="w-5 h-5 text-theme-muted opacity-80 hover:opacity-100 transition-opacity"
              />
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
