/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AskBoxHost } from "../src/templates/ask-box-host";

describe("the Ask box host", () => {
  it("prompts in the field with the page's own words when it has them", () => {
    const html = renderToStaticMarkup(
      <AskBoxHost prefix="opening" placeholder="What’s on your mind?" />,
    );
    expect(html).toContain(
      '<textarea rows="1" disabled="" aria-label="Your question" placeholder="What’s on your mind?"></textarea>',
    );
  });

  it("hands the owner's name and the prompt to the box it mounts", () => {
    const html = renderToStaticMarkup(
      <AskBoxHost
        prefix="atlas"
        name="Yeehaa"
        placeholder="Ask about my work…"
      />,
    );
    expect(html).toContain('data-ask-name="Yeehaa"');
    expect(html).toContain('data-ask-placeholder="Ask about my work…"');
  });

  it("leaves the field unprompted and unnamed otherwise", () => {
    const html = renderToStaticMarkup(<AskBoxHost prefix="atlas" />);
    expect(html).toContain(
      '<textarea rows="1" disabled="" aria-label="Your question"></textarea>',
    );
    expect(html).not.toContain("data-ask-name");
    expect(html).not.toContain("data-ask-placeholder");
  });
});
