import type { JSX, ComponentChildren } from "preact";
import type { LayoutSlots } from "@brains/site-engine";
import type { SiteLayoutInfo } from "@brains/site-composition";
import { Header, Footer } from "@brains/ui-library";

export interface ProfessionalLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
  /** Optional slots for plugin-registered UI components */
  slots?: LayoutSlots;
}

/**
 * Professional site layout with compact header and full footer with navigation
 * Clean and minimal
 */
export function ProfessionalLayout({
  sections,
  siteInfo,
  slots,
}: ProfessionalLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme overflow-x-clip">
      <Header
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        showThemeToggle
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
      />

      <main className="flex-grow flex flex-col bg-theme">{sections}</main>

      <div className="section-divider" />

      <Footer
        primaryNavigation={siteInfo.navigation.primary}
        secondaryNavigation={siteInfo.navigation.secondary}
        copyright={siteInfo.copyright}
        socialLinks={siteInfo.socialLinks}
        title={siteInfo.title}
        tagline={siteInfo.description}
      >
        {slots?.getSlot("footer-top").map((entry) => entry.render())}
      </Footer>
    </div>
  );
}
