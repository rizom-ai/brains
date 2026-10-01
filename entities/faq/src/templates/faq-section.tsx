import type { JSX } from "react";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { MarkdownContent } from "@brains/ui-library";
import {
  FAQ_DATASOURCE_ID,
  faqSectionSchema,
  type FaqSectionData,
} from "../datasources/faq-datasource";

/**
 * Published public FAQs as disclosures. Sites place it in a route section and
 * supply their own heading; it renders nothing until a FAQ is published.
 */
export const FaqSection = ({ faqs }: FaqSectionData): JSX.Element => {
  if (faqs.length === 0) return <></>;

  return (
    <div className="faq-section flex flex-col divide-y divide-theme">
      {faqs.map((faq) => (
        <details key={faq.id} className="group py-4">
          <summary className="cursor-pointer font-semibold text-theme">
            {faq.question}
          </summary>
          <MarkdownContent markdown={faq.answer} className="mt-3" />
        </details>
      ))}
    </div>
  );
};

/**
 * Named `faq-section`, not `faq-list`, so the site builder derives no route
 * from it: each site decides where FAQs appear.
 */
export function getTemplates(): Record<string, Template> {
  return {
    "faq-section": createTemplate<FaqSectionData>({
      name: "faq-section",
      description: "Published public FAQs as questions with answers",
      schema: faqSectionSchema,
      dataSourceId: FAQ_DATASOURCE_ID,
      requiredPermission: "public",
      layout: { component: FaqSection },
    }),
  };
}
