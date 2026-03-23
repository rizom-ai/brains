import type { JSX } from "preact";
import { ProseContent } from "./ProseContent";
import { useMarkdownToHtml } from "./ImageRendererProvider";

export interface MarkdownContentProps {
  markdown: string;
  className?: string;
}

/**
 * Renders markdown content with image optimization support.
 *
 * Combines `markdownToHtml` conversion with `ProseContent` rendering.
 * When rendered inside an `ImageRendererProvider` (during site builds),
 * entity://image references are automatically resolved to optimized
 * `<img srcset="...">` tags.
 *
 * Replaces the common pattern:
 * ```tsx
 * const htmlContent = markdownToHtml(post.body);
 * <ProseContent html={htmlContent} />
 * ```
 *
 * With:
 * ```tsx
 * <MarkdownContent markdown={post.body} />
 * ```
 */
export const MarkdownContent = ({
  markdown,
  className,
}: MarkdownContentProps): JSX.Element => {
  const toHtml = useMarkdownToHtml();
  return (
    <ProseContent html={toHtml(markdown)} {...(className && { className })} />
  );
};
