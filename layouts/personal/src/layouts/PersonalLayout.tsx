import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo, LayoutSlots } from "@brains/site-builder-plugin";
import { Slot } from "@brains/site-builder-plugin";
import { Header, AnimatedWaveDivider } from "@brains/ui-library";
import { Footer } from "@brains/default-site-content";

export interface PersonalLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
  slots?: LayoutSlots;
}

/**
 * Personal site layout — clean, minimal, blog-focused
 * No decks, no portfolio, no complex dependencies
 */
export function PersonalLayout({
  sections,
  siteInfo,
  slots,
}: PersonalLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme overflow-x-clip">
      <Header
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
