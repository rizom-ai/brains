import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";
import { FooterCTA } from "../footer-cta";
import { LinkButton } from "@brains/ui-library";

declare global {
  interface Window {
    toggleTheme?: () => void;
  }
}

export interface CTAFooterLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
}

/**
 * Layout with CTA footer - for pages with prominent call-to-action
 */
export function CTAFooterLayout({
  sections,
  siteInfo,
}: CTAFooterLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme-gradient">
      {/* Simple header with site title */}
      <header className="py-4 bg-header">
        <div className="container mx-auto px-4 max-w-6xl flex flex-row justify-between items-center gap-3">
          <a
            href="/"
            className="font-bold text-xl text-nav hover:text-accent transition-colors"
          >
            {siteInfo.title}
          </a>
          <div className="flex items-center gap-3 sm:gap-6">
            <nav className="flex flex-wrap gap-3 sm:gap-4">
              {siteInfo.navigation.primary.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-nav hover:text-accent transition-colors text-sm sm:text-base"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            {siteInfo.cta && (
              <LinkButton
                href={siteInfo.cta.buttonLink}
                variant="accent"
                size="sm"
                external
                className="whitespace-nowrap"
              >
                {siteInfo.cta.buttonText}
              </LinkButton>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col">{sections}</main>

      {/* Render CTA footer if configured */}
      <FooterCTA siteInfo={siteInfo} />
    </div>
  );
}
