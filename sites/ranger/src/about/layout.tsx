import type { JSX } from "preact";
import type { AboutContent } from "./schema";
import { markdownToHtml } from "@brains/utils";
import { PresentationLayout, ProseContent } from "@brains/ui-library";

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
    <section className="about-section flex-grow min-h-screen">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl py-20">
        <ProseContent html={htmlContent} />
      </div>
    </section>
  );
};
