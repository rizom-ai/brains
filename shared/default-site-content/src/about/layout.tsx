import type { JSX } from "preact";
import type { AboutContent } from "./schema";
import { markdownToHtml } from "@brains/utils";
import { PresentationLayout } from "@brains/ui-library";

/**
 * About page layout - auto-detects presentation mode
 * If markdown contains slide separators (---), renders as reveal.js presentation
 * Otherwise, renders as regular markdown document
 */
export const AboutLayout = ({ markdown }: AboutContent): JSX.Element => {
  // Detect if this is a presentation by checking for slide separators
  const hasSlides = /^---$/gm.test(markdown);

  // Use presentation layout if slides are detected
  if (hasSlides) {
    return <PresentationLayout markdown={markdown} />;
  }

  // Otherwise use regular markdown layout
  const htmlContent = markdownToHtml(markdown);

  return (
    <section className="about-section flex-grow min-h-screen bg-theme">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl py-20">
        <article
          className="prose prose-lg max-w-none
            prose-h1:text-4xl prose-h1:font-bold prose-h1:mb-8 prose-h1:mt-0
            prose-h2:text-3xl prose-h2:font-semibold prose-h2:mt-16 prose-h2:mb-6 prose-h2:border-b prose-h2:pb-4
            prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-4
            prose-p:text-lg prose-p:leading-relaxed prose-p:mb-6
            prose-ul:my-6 prose-ul:space-y-3
            prose-ol:my-6 prose-ol:space-y-3
            prose-li:leading-relaxed
            prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
            prose-pre:rounded-lg prose-pre:my-6 prose-pre:p-4 prose-pre:overflow-x-auto prose-pre:text-sm
            prose-blockquote:border-l-4 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:my-6
            prose-hr:my-12
            prose-img:rounded-lg prose-img:shadow-md prose-img:my-8"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </section>
  );
};
