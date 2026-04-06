import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";

export interface DefaultLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}

/**
 * Default layout for rizom sites.
 *
 * Structure:
 *   <div class="bg-theme relative min-h-screen">
 *     <div id="bgCanvasWrap"><canvas id="heroCanvas" /></div>
 *     <main>{sections}</main>
 *   </div>
 *
 * No header or footer in this minimal version — those come in Phase 2b
 * once more sections land. The canvas wrapper is positioned
 * absolutely, filling the viewport behind the content, with the
 * variant-specific canvas script injected via the site plugin's
 * head script registration.
 */
export function DefaultLayout({ sections }: DefaultLayoutProps): JSX.Element {
  return (
    <div
      className="bg-theme relative min-h-screen"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
    >
      {/* Background canvas — filled by variant-specific tree/constellation/roots script */}
      <div
        id="bgCanvasWrap"
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0, opacity: 0.6 }}
      >
        <canvas
          id="heroCanvas"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>

      <main className="relative" style={{ zIndex: 1 }}>
        {sections}
      </main>
    </div>
  );
}
