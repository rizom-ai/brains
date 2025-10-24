import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";

declare global {
  interface Window {
    toggleTheme?: () => void;
  }
}

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
      <header className="py-4 bg-header border-b border-white/10">
        <div className="container mx-auto px-4 max-w-6xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <a
            href="/"
            className="font-bold text-xl text-nav hover:text-accent transition-colors"
          >
            {siteInfo.title}
          </a>
          <div className="flex items-center gap-4">
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
            <button
              // @ts-expect-error - onclick is valid HTML attribute for SSR
              onclick="toggleTheme()"
              type="button"
              className="p-2 rounded-full bg-theme-toggle hover-theme-toggle-swap transition-colors"
              aria-label="Toggle dark mode"
            >
              <svg
                className="w-5 h-5 text-theme-toggle-icon transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  className="sun-icon"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
                <path
                  className="moon-icon"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  transform="rotate(45 12 12)"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col bg-theme-gradient">
        {sections}
      </main>
    </div>
  );
}
