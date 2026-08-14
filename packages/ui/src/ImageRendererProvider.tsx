import { createContext, h, type JSX } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { markdownToHtml, type ImageRenderer } from "./markdown-html";

/**
 * Context for sharing the ImageRenderer during SSR.
 * Same pattern as HeadProvider — the site builder provides the renderer
 * during build-time rendering, and templates access it via hooks.
 */
const ImageRendererContext = createContext<ImageRenderer | null>(null);

export interface ImageRendererProviderProps {
  imageRenderer: ImageRenderer | null | undefined;
  children: ComponentChildren;
}

/**
 * Provider that makes an ImageRenderer available to child components during SSR.
 *
 * NOTE: Uses h() instead of JSX to ensure consistent Preact VNode creation.
 * (Same reason as HeadProvider — Bun's JSX runtime resolution can be inconsistent.)
 */
export function ImageRendererProvider({
  imageRenderer,
  children,
}: ImageRendererProviderProps): JSX.Element {
  return h(
    ImageRendererContext.Provider,
    { value: imageRenderer ?? null },
    children,
  );
}

/**
 * Hook to access the ImageRenderer from context.
 * Returns null if no renderer is available (e.g. outside a build context).
 */
export function useImageRenderer(): ImageRenderer | null {
  return useContext(ImageRendererContext);
}

/**
 * Hook that returns a markdownToHtml function with image optimization.
 *
 * When an ImageRenderer is available (during site builds), inline
 * entity://image references are resolved to optimized <img srcset="...">.
 * When no renderer is available, falls back to standard markdownToHtml.
 *
 * @example
 * ```tsx
 * const toHtml = useMarkdownToHtml();
 * const htmlContent = toHtml(post.body);
 * ```
 */
export function useMarkdownToHtml(): (markdown: string) => string {
  const imageRenderer = useImageRenderer();
  return (markdown: string): string =>
    markdownToHtml(markdown, imageRenderer ? { imageRenderer } : undefined);
}
