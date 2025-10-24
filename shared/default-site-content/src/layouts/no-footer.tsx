import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";

export interface NoFooterLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
}

/**
 * Layout without footer - for pages with custom CTA sections
 */
export function NoFooterLayout({
  sections,
  siteInfo,
}: NoFooterLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme">
      {/* Simple header with site title */}
      <header className="py-4 bg-footer border-b border-white/10">
        <div className="container mx-auto px-4 max-w-6xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <a
            href="/"
            className="font-bold text-xl text-white hover:text-accent transition-colors"
          >
            {siteInfo.title}
          </a>
          <nav className="flex flex-wrap gap-3 sm:gap-4">
            {siteInfo.navigation.primary.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-white hover:text-accent transition-colors text-sm sm:text-base"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-grow flex flex-col bg-theme-gradient">
        {sections}
      </main>
    </div>
  );
}
