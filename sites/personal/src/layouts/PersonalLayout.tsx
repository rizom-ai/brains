import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo, LayoutSlots } from "@brains/site-builder-plugin";
import { Header, ThemeToggle } from "@brains/ui-library";

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
 * Compact header + content + minimal footer.
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
        titleClassName="font-heading font-bold text-2xl"
        navigation={siteInfo.navigation.primary}
        showThemeToggle
        themeToggleClassName="bg-theme-toggle text-theme-toggle-icon hover:bg-theme-toggle-hover rounded-[10px]"
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
      />

      <main className="flex-grow flex flex-col">{sections}</main>

      <footer className="bg-footer text-footer border-t border-theme">
        <div className="max-w-layout mx-auto flex flex-col md:flex-row justify-between items-center py-8 px-6 md:px-8">
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
                className="text-theme-muted text-[13px] hover:text-brand transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            {siteInfo.copyright && (
              <span className="text-theme-light text-[11px]">
                {siteInfo.copyright}
              </span>
            )}
            <ThemeToggle variant="footer" size="sm" />
          </div>
        </div>
      </footer>
    </div>
  );
}
