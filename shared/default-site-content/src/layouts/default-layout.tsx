import type { JSX, ComponentChildren } from "preact";
import { FooterLayout } from "../footer/layout";
import type { NavigationItem } from "../footer/schema";

export interface DefaultLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
}

/**
 * Default layout for pages
 * Renders JSX sections directly with footer
 */
export function DefaultLayout({
  sections,
  title: _title, // Will be used with Helmet later
  description: _description, // Will be used with Helmet later
}: DefaultLayoutProps): JSX.Element {
  // Footer navigation items - hardcoded for now
  // Will be made dynamic with DataSource later
  const footerNavigation: NavigationItem[] = [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];

  return (
    <>
      {/* Head content will be managed by Helmet later */}
      <main class="min-h-full">{sections}</main>
      <FooterLayout navigation={footerNavigation} />
    </>
  );
}
