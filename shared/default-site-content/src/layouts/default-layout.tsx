import type { JSX, ComponentChildren } from "preact";
import { FooterLayout } from "../footer/layout";
import type { SiteInfo } from "@brains/site-builder-plugin/src/types/site-info";

export interface DefaultLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  siteInfo: SiteInfo;
}

/**
 * Default layout for pages
 * Renders JSX sections directly with footer
 */
export function DefaultLayout({
  sections,
  title: _title, // Will be used with Helmet later
  description: _description, // Will be used with Helmet later
  siteInfo,
}: DefaultLayoutProps): JSX.Element {
  return (
    <div class="flex flex-col min-h-screen">
      {/* Head content will be managed by Helmet later */}
      <main class="flex-grow">{sections}</main>
      <FooterLayout
        navigation={siteInfo.navigation.primary}
        copyright={siteInfo.copyright}
      />
    </div>
  );
}
