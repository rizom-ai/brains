/**
 * Renderer-neutral SSR contracts shared by the component library (which
 * adapts its markdown library's callbacks to these shapes at its own
 * boundary) and the site build engine (which implements them). Neither side
 * may leak its implementation choice into the other: swapping the markdown
 * library or the build engine must not be an API change here.
 */

/** A markdown image reference, independent of any markdown library's AST. */
export interface RenderedImageRef {
  href: string;
  alt: string;
  title?: string | undefined;
}

/**
 * Renders a markdown image reference to an HTML string, or returns undefined
 * to fall through to the markdown library's default rendering.
 */
export type ImageRenderer = (image: RenderedImageRef) => string | undefined;

/** Head metadata a page component contributes during SSR. */
export interface HeadProps {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  canonicalUrl?: string;
}

/**
 * Collector the build engine provides during SSR; components contribute
 * head metadata through it via the `Head` component.
 */
export interface HeadCollectorInterface {
  setHeadProps(props: HeadProps): void;
}
