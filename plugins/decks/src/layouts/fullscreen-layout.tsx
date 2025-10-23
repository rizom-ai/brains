import type { JSX, ComponentChildren } from "preact";

export interface FullscreenLayoutProps {
  sections: ComponentChildren[];
}

/**
 * Fullscreen layout with no header or footer
 * Used for presentations that need full viewport
 */
export function FullscreenLayout({
  sections,
}: FullscreenLayoutProps): JSX.Element {
  return <div className="w-full h-screen">{sections}</div>;
}
