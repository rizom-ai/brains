import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo, LayoutSlots } from "@brains/site-builder-plugin";
import { Slot } from "@brains/site-builder-plugin";
import { CompactHeader } from "../components/CompactHeader";
import { AnimatedWaveDivider } from "@brains/ui-library";
import { Footer } from "@brains/default-site-content";

export interface ProfessionalLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
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
      <CompactHeader
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
      />

      <main className="flex-grow flex flex-col bg-theme">{sections}</main>

      <AnimatedWaveDivider />

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
