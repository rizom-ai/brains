import type { JSX, ComponentChildren } from "preact";
import { FooterLayout } from "../footer/layout";
import type { SiteInfo } from "@brains/site-builder-plugin/src/types/site-info";

export interface DefaultLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
}

/**
 * Default layout for pages
 * Renders JSX sections directly with footer
 * Head metadata is now handled by the SSR process
 */
export function DefaultLayout({
  sections,
  siteInfo,
}: DefaultLayoutProps): JSX.Element {
  return (
    <div class="flex flex-col min-h-screen bg-theme">
      <main class="flex-grow bg-theme">{sections}</main>
      <FooterLayout
        navigation={siteInfo.navigation.primary}
        copyright={siteInfo.copyright}
      />
    </div>
  );
}
