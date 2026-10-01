import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import type { HomepageFaq } from "../schemas/homepage-faqs";
import { homepageFaqsStyles } from "./homepage-faqs-styles";

/**
 * The owner's published FAQs under the atlas, most asked first: questions
 * visitors put to the brain, answered and approved by the owner. Every
 * question is closed until tapped and one answer is open at a time, without
 * a script. The heading is the owner's own, or there is none.
 */
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
              <MarkdownContent markdown={faq.answer} className="faqs__answer" />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
