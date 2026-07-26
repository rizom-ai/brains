/** @jsxImportSource preact */
import type { ComponentChildren, JSX } from "preact";

export interface CanaryLayoutProps {
  /** Rendered section output for the current route. */
  sections: ComponentChildren[];
}

/**
 * Minimal themed page shell for the canary. Wraps the route's sections in a
 * full-height themed container and nothing else — no navigation, footer, or
 * site-info dependency — so the page renders regardless of brain content.
 */
export function CanaryLayout({ sections }: CanaryLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-theme overflow-x-clip">
      <main className="flex-grow flex flex-col bg-theme">{sections}</main>
    </div>
  );
}
