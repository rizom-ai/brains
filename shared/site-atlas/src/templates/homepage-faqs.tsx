import type { JSX } from "react";
import { useMarkdownToHtml } from "@brains/ui-library";
import type { HomepageFaq } from "../schemas/homepage-faqs";
import { homepageFaqsStyles } from "./homepage-faqs-styles";

/**
 * The owner's published FAQs under the atlas, ranked ones first, then the
 * most asked: questions visitors put to the brain, answered and approved by
 * the owner. Every
 * question is closed until tapped and one answer is open at a time, without
 * a script. The heading is the owner's own, or there is none.
 */
/** The band's own answer type: a blog post's prose sizes would set it larger than the question. */
function FaqAnswer({ markdown }: { markdown: string }): JSX.Element {
  const toHtml = useMarkdownToHtml();
  return (
    <div
      className="faqs__answer"
      dangerouslySetInnerHTML={{ __html: toHtml(markdown) }}
    />
  );
}

export function HomepageFaqs({
  heading,
  faqs,
}: {
  heading: string | null;
  faqs: HomepageFaq[];
}): JSX.Element | null {
  if (faqs.length === 0) return null;
  return (
    <section className="faqs" data-atlas-faqs="">
      <style>{homepageFaqsStyles}</style>
      <div className="faqs__inner">
        <div className="faqs__index">
          {heading && <h2>{heading}</h2>}
          {faqs.map((faq) => (
            <details key={faq.id} name="faqs">
              <summary>{faq.question}</summary>
              <FaqAnswer markdown={faq.answer} />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
