import type { JSX, ComponentChildren } from "preact";

export interface DefaultLayoutProps {
  sections: ComponentChildren[]; // JSX elements for sections
  title: string;
  description: string;
}

/**
 * Default layout for pages
 * Renders JSX sections directly
 */
export function DefaultLayout({
  sections,
  title: _title, // Will be used with Helmet later
  description: _description, // Will be used with Helmet later
}: DefaultLayoutProps): JSX.Element {
  return (
    <>
      {/* Head content will be managed by Helmet later */}
      <main class="min-h-full">
        {sections}
      </main>
    </>
  );
}