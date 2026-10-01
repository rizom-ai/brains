/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { FaqSection } from "../src";

describe("FaqSection", () => {
  it("renders each question as a disclosure with its markdown answer", () => {
    const html = render(
      <FaqSection
        faqs={[
          {
            id: "faq-1",
            question: "How do I publish a draft?",
            answer: "Choose **Publish** in Studio.",
            asked: 3,
          },
        ]}
      />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("How do I publish a draft?");
    expect(html).toContain("<strong>Publish</strong>");
  });

  it("renders nothing without FAQs", () => {
    expect(render(<FaqSection faqs={[]} />)).toBe("");
  });
});
