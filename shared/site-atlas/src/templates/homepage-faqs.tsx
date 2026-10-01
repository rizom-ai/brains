import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import type { HomepageFaq } from "../schemas/homepage-faqs";
import { homepageFaqsStyles } from "./homepage-faqs-styles";

/**
 * The owner's published FAQs under the atlas, most asked first: questions
 * visitors put to the brain, answered and approved by the owner. One answer
 * is open at a time, the most asked to start with, and every answer reads
 * without a script; on desktop the atlas script shows the open one beside
 * the questions. The heading is the owner's own, or there is none.
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
          {faqs.map((faq, index) => (
            <details key={faq.id} name="faqs" open={index === 0}>
              <summary>{faq.question}</summary>
              <MarkdownContent markdown={faq.answer} className="faqs__answer" />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
