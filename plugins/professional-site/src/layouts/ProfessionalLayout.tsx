import type { JSX, ComponentChildren } from "preact";
import { Footer } from "@brains/default-site-content";
import type { SiteInfo } from "@brains/site-builder-plugin";
import { CompactHeader } from "../components/CompactHeader";

export interface ProfessionalLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}

/**
 * Professional site layout with compact header
 * Clean and minimal
 */
export function ProfessionalLayout({
  sections,
  siteInfo,
}: ProfessionalLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme">
      <CompactHeader
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
      />

      <main className="flex-grow flex flex-col bg-theme">{sections}</main>

      <Footer
        primaryNavigation={siteInfo.navigation.primary}
        secondaryNavigation={siteInfo.navigation.secondary}
        copyright={siteInfo.copyright}
        socialLinks={siteInfo.socialLinks}
      />
    </div>
  );
}
