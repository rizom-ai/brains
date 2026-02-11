import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";
import { Header } from "@brains/ui-library";
import { FooterCTA } from "../footer-cta";

export interface DefaultCTALayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}

/**
 * Default layout with CTA footer — standard header + FooterCTA
 * Same as DefaultLayout but replaces the regular Footer with the CTA footer
 * (WavyDivider + CTA heading/button + footer content)
 */
export function DefaultCTALayout({
  sections,
  siteInfo,
}: DefaultCTALayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme">
      <Header
        title={siteInfo.title}
        navigation={siteInfo.navigation.primary}
        variant="cta"
        {...(siteInfo.logo !== undefined ? { logo: siteInfo.logo } : {})}
        {...(siteInfo.cta ? { cta: siteInfo.cta } : {})}
      />

      <main className="flex-grow flex flex-col bg-theme">{sections}</main>

      <FooterCTA siteInfo={siteInfo} />
    </div>
  );
}
