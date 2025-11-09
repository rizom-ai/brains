import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";
import { FooterCTA } from "../footer-cta";
import { Header } from "@brains/ui-library";

declare global {
  interface Window {
    toggleTheme?: () => void;
  }
}

export interface CTAFooterLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
  path: string; // Current route path for canonical URL
  siteInfo: SiteInfo;
}

/**
 * Layout with CTA footer - for pages with prominent call-to-action
 */
export function CTAFooterLayout({
  sections,
  siteInfo,
}: CTAFooterLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme-gradient">
      <Header
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        variant="cta"
        {...(siteInfo.cta ? { cta: siteInfo.cta } : {})}
      />

      <main className="flex-grow flex flex-col">{sections}</main>

      {/* Render CTA footer if configured */}
      <FooterCTA siteInfo={siteInfo} />
    </div>
  );
}
