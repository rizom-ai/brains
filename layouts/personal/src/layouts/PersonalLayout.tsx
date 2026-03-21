import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo, LayoutSlots } from "@brains/site-builder-plugin";
import { Header } from "@brains/ui-library";

export interface PersonalLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
  slots?: LayoutSlots;
}

/**
 * Personal site layout — clean, blog-focused.
 *
 * Simple header + content + minimal footer.
 * No wave divider, no complex footer — matches the mlp Paper design.
 */
export function PersonalLayout({
  sections,
  siteInfo,
}: PersonalLayoutProps): JSX.Element {
  const footerNav = [
    ...siteInfo.navigation.primary,
    ...siteInfo.navigation.secondary,
  ].filter((item) => item.label !== "Home");

  return (
    <div className="flex flex-col min-h-screen bg-theme">
      <Header
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
      />

      <main className="flex-grow flex flex-col">{sections}</main>

      <footer className="flex flex-col md:flex-row justify-between items-center py-8 px-6 md:px-12 bg-theme border-t border-theme">
        <div className="flex flex-col gap-1 mb-4 md:mb-0">
          <span className="text-brand font-heading font-bold text-lg">
            {siteInfo.title}
          </span>
          {siteInfo.description && (
            <span className="text-theme-muted text-xs">
              {siteInfo.description}
            </span>
          )}
        </div>
        <nav className="flex gap-6 mb-4 md:mb-0">
          {footerNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-theme-muted text-sm hover:text-brand transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
        {siteInfo.copyright && (
          <span className="text-theme-light text-xs">{siteInfo.copyright}</span>
        )}
      </footer>
    </div>
  );
}
