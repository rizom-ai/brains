import type { JSX, ComponentChildren } from "preact";
import { Footer } from "../footer";
import type { SiteInfo } from "@brains/site-builder-plugin";

export interface DefaultLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
}

/**
 * Minimal default layout for Personal Brain sites
 * Clean, content-focused design
 */
export function DefaultLayout({
  sections,
  siteInfo,
}: DefaultLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme">
      {/* Simple header with site title */}
      <header className="py-4 border-b border-theme-border">
        <div className="container mx-auto px-4 max-w-6xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <a
            href="/"
            className="font-bold text-xl text-theme hover:text-brand transition-colors"
          >
            {siteInfo.title}
          </a>
          <nav className="flex flex-wrap gap-3 sm:gap-4">
            {siteInfo.navigation.primary.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-theme hover:text-brand transition-colors text-sm sm:text-base"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-grow flex flex-col bg-theme">{sections}</main>

      <Footer navigation={siteInfo.navigation.primary} />
    </div>
  );
}
