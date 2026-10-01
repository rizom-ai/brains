import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HomepageFaqs } from "../src/templates/homepage-faqs";
import { homepageFaqsSchema } from "../src/schemas/homepage-faqs";

const faqs = homepageFaqsSchema.parse([
  {
    id: "ecosystem-architecture",
    question: "What is ecosystem architecture?",
    answer: "Designing organizations as **living systems**.",
  },
  {
    id: "knowledge-audit",
    question: "What does a Knowledge Audit involve?",
    answer: "1. Mapping knowledge sources\n2. Tracing knowledge flows",
  },
]);

// The owner's published FAQs under the atlas, most asked first: one answer
// open at a time, readable without any script.
describe("HomepageFaqs", () => {
  it("renders nothing while no FAQ is published", () => {
    expect(
      renderToStaticMarkup(<HomepageFaqs heading="Asked before" faqs={[]} />),
    ).toBe("");
  });

  it("opens the most asked question, one at a time", () => {
    const html = renderToStaticMarkup(
      <HomepageFaqs heading="Asked before" faqs={faqs} />,
    );
    const details = [...html.matchAll(/<details[^>]*>/g)].map(([tag]) => tag);
    expect(details).toHaveLength(2);
    expect(details.every((tag) => tag.includes('name="faqs"'))).toBe(true);
    expect(details[0]).toContain("open");
    expect(details[1]).not.toContain("open");
    expect(html.indexOf("ecosystem architecture")).toBeLessThan(
      html.indexOf("Knowledge Audit"),
    );
    expect(html).toContain(
      "<summary>What is ecosystem architecture?</summary>",
    );
    expect(html).toContain("<strong>living systems</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain("data-atlas-faqs");
  });

  it("names the band in the owner's words, or not at all", () => {
    expect(
      renderToStaticMarkup(<HomepageFaqs heading="Asked before" faqs={faqs} />),
    ).toContain("<h2>Asked before</h2>");
    expect(
      renderToStaticMarkup(<HomepageFaqs heading={null} faqs={faqs} />),
    ).not.toContain("<h2");
  });
});
