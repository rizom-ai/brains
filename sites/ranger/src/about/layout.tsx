import type { JSX } from "preact";
import type { AboutContent } from "./schema";
import { PresentationLayout, MarkdownContent } from "@brains/ui-library";

/**
 * About page layout - auto-detects presentation mode
 * If markdown contains slide separators (---), renders as reveal.js presentation
 * Otherwise, renders as regular markdown document
 */
export const AboutLayout = ({ markdown }: AboutContent): JSX.Element => {
  const hasSlides = /^---$/gm.test(markdown);

  if (hasSlides) {
    return <PresentationLayout markdown={markdown} />;
  }

  return (
    <section className="about-section flex-grow min-h-screen">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl py-20">
        <MarkdownContent markdown={markdown} />
      </div>
    </section>
  );
};
