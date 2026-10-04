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
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("escapes questions and sanitizes authored answers through public UI", () => {
    const html = render(
      <FaqSection
        faqs={[
          {
            id: "unsafe",
            asked: 1,
            question: '<img src=x onerror="alert(1)">',
            answer:
              '<script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="https://example.test/image.png" onerror="alert(1)">',
          },
        ]}
      />,
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/<img[^>]*onerror/);
    expect(html).toContain("https://example.test/image.png");
  });

  it("renders nothing without FAQs", () => {
    expect(render(<FaqSection faqs={[]} />)).toBe("");
  });
});
