import type { JSX, ComponentChildren } from "preact";
import { Footer } from "../footer";
import { Header } from "@brains/ui-library";
import {
  Slot,
  type SiteInfo,
  type LayoutSlots,
} from "@brains/site-builder-plugin";

export interface DefaultLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
  slots?: LayoutSlots;
}

/**
 * Minimal default layout for Personal Brain sites
 * Clean, content-focused design
 */
export function DefaultLayout({
  sections,
  siteInfo,
  slots,
}: DefaultLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme">
      <Header
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        variant="default"
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
      />

      <main className="flex-grow flex flex-col bg-theme">{sections}</main>

      <Footer
        primaryNavigation={siteInfo.navigation.primary}
        secondaryNavigation={siteInfo.navigation.secondary}
        copyright={siteInfo.copyright}
        socialLinks={siteInfo.socialLinks}
      >
        <Slot name="footer-top" slots={slots} />
      </Footer>
    </div>
  );
}
