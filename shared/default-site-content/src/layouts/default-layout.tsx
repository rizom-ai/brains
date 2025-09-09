import type { JSX, ComponentChildren } from "preact";
import { Head } from "../components/head";
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
 */
export function DefaultLayout({
  sections,
  title,
  description,
  path,
  siteInfo,
}: DefaultLayoutProps): JSX.Element {
  const canonicalUrl = siteInfo.url ? `${siteInfo.url}${path}` : undefined;

  return (
    <div class="flex flex-col min-h-screen">
      <Head
        title={title}
        description={description}
        {...(canonicalUrl && { canonicalUrl })}
      />
      <main class="flex-grow">{sections}</main>
      <FooterLayout
        navigation={siteInfo.navigation.primary}
        copyright={siteInfo.copyright}
      />
    </div>
  );
}
