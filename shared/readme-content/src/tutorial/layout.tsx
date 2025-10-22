import type { JSX } from "preact";
import type { TutorialContent } from "./schema";
import { markdownToHtml } from "@brains/utils";
import { PresentationLayout } from "@brains/ui-library";

/**
 * Tutorial layout - auto-detects presentation mode
 * If markdown contains slide separators (---), renders as reveal.js presentation
 * Otherwise, renders as regular markdown document
 */
export const TutorialLayout = ({ markdown }: TutorialContent): JSX.Element => {
  // Detect if this is a presentation by checking for slide separators
  const hasSlides = /^---$/gm.test(markdown);

  // Use presentation layout if slides are detected
  if (hasSlides) {
    return <PresentationLayout markdown={markdown} />;
  }

  // Otherwise use regular markdown layout
  const htmlContent = markdownToHtml(markdown);

  return (
    <section className="tutorial-section flex-grow">
      <div className="container mx-auto px-4 max-w-4xl py-12">
        <div
          className="prose prose-lg max-w-none prose-headings:text-theme prose-p:text-theme-muted prose-a:text-brand prose-strong:text-theme prose-code:text-brand prose-pre:bg-surface-secondary prose-li:text-theme-muted"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </section>
  );
};
