import type { JSX, ComponentChildren } from "preact";
import { Footer } from "../footer";
import type { SiteInfo } from "@brains/site-builder-plugin/src/types/site-info";

export interface MinimalLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
}

/**
 * Minimal layout without header but with footer
 * Used for home and dashboard pages
 */
export function MinimalLayout({
  sections,
  siteInfo,
}: MinimalLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme">
      <main className="flex-grow flex flex-col bg-theme">{sections}</main>
      
      <Footer navigation={siteInfo.navigation.primary} />
    </div>
  );
}