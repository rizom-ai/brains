import type { JSX } from "preact";

export interface ProseContentProps {
  html: string;
  className?: string;
}

/**
 * Shared prose typography component for rendering markdown content.
 * Used by blog posts, about pages, and any other markdown-based content.
 *
 * Provides consistent typography styling across all content pages:
 * - Large, readable text (prose-lg)
 * - Hierarchical heading sizes (h1-h3)
 * - Proper spacing and line-height
 * - Code block styling
 * - Blockquote styling
 * - Image styling with shadows
 */
export const ProseContent = ({
  html,
  className = "",
}: ProseContentProps): JSX.Element => {
  return (
    <article
      className={`prose prose-lg max-w-none
        prose-h1:text-4xl prose-h1:font-bold prose-h1:mb-8 prose-h1:mt-0
        prose-h2:text-3xl prose-h2:font-semibold prose-h2:mt-16 prose-h2:mb-6 prose-h2:border-b prose-h2:pb-4
        prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-4
        prose-p:text-lg prose-p:leading-relaxed prose-p:mb-6
        prose-ul:my-6 prose-ul:space-y-3
        prose-ol:my-6 prose-ol:space-y-3
        prose-li:leading-relaxed
        prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
        prose-pre:rounded-lg prose-pre:my-6 prose-pre:p-4 prose-pre:overflow-x-auto prose-pre:text-sm
        prose-blockquote:border-l-2 prose-blockquote:border-brand prose-blockquote:pl-6 prose-blockquote:py-2 prose-blockquote:mt-8 prose-blockquote:mb-2 prose-blockquote:text-lg prose-blockquote:leading-relaxed prose-blockquote:font-light prose-blockquote:not-italic
        prose-hr:my-12
        prose-img:rounded-lg prose-img:shadow-md prose-img:my-8 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
