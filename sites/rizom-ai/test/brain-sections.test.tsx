/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import { sectionGroupToTemplates } from "@brains/site-composition";
import { brainSections } from "../src/brain";
import { rizomRuntimeStaticAssets } from "../src/rizom/runtime/plugin";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());
const templates = sectionGroupToTemplates(brainSections);
const lead = {
  cap: "A caption",
  headline: "A *useful agent*.",
  body: ["Authored copy."],
};
const cta = { label: "Explore", href: "#answers" };
function render(id: string, data: unknown): string {
  const section = brainSections.sections[id];
  if (!section) throw new Error(id);
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(section.component),
      propsSchema.parse(section.schema.parse(data)),
    ),
  );
}

describe("Brain product landing page", () => {
  test("the existing chat box starts non-sending and loads only its enhancement script", () => {
    const html = render("hero", {
      ...lead,
      provenance: "Available now",
      primaryCta: cta,
      secondaryCta: cta,
      chat: {
        title: "Ask Rizom",
        inputHint: "A question",
        notice: "Public chat is coming soon.",
        topicsLabel: "Topics",
        topics: ["Governance"],
      },
      navigation: [cta, cta, cta, cta],
    });
    expect(html).toContain('id="brain-chat"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Public chat is coming soon.");
    expect(html).not.toContain("<form");
    expect(html).toContain('src="/brain-chat.js"');
    expect(html).toContain("data-chat-topic");
    expect(html).not.toContain("data-ask-panel");
    expect(html).not.toContain("/ask/assets/guest.js");
    expect(html).not.toContain("/api/chat");
    expect(html).not.toContain("hero-note");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('class="heading-emphasis"');
  });
  test("code indentation and optional lines survive canonical Markdown", () => {
    const data = {
      ...lead,
      aside: { text: "Extend it.", links: [] },
      code: {
        title: "brain.yaml",
        note: "Excerpt",
        lines: [
          { text: "bundles:", indent: 0, kind: "code" },
          { text: "- core", indent: 2, kind: "code" },
          { text: "# - automation", indent: 2, kind: "optional" },
        ],
      },
    };
    const formatter = templates["ask"]?.formatter;
    if (!formatter) throw new Error("Missing formatter");
    expect(formatter.parse(formatter.format(data))).toEqual(data);
    const html = render("ask", data);
    expect(html).toContain("  - core");
    expect(html).toContain("  # - automation");
    expect(html).not.toContain("<button");
  });
  test("screenshots expose matching full-size variants and honest captions", () => {
    const html = render("capture", {
      ...lead,
      aside: { text: "Check sources.", links: [] },
      capture: {
        kind: "chat",
        alt: "Illustrative Studio conversation",
        caption: "Example data, not a recorded agent run.",
        openLabel: "Open capture",
      },
    });
    for (const theme of ["dark", "light"])
      for (const size of ["desktop", "mobile"]) {
        const path = `/images/brain/chat-${size}-${theme}.svg`;
        expect(html).toContain(`href="${path}"`);
        expect(html).toContain(`src="${path}"`);
        expect(rizomRuntimeStaticAssets[path]).toContain(
          "data:image/png;base64,",
        );
      }
    expect(html).toContain("Example data, not a recorded agent run.");
    expect(html).toContain('rel="noopener"');
  });
  test("a capture without a caption renders no caption element", () => {
    const data = {
      ...lead,
      aside: { text: "Product knowledge.", links: [] },
      capture: {
        kind: "chat",
        alt: "Studio conversation",
        openLabel: "Open capture",
      },
    };
    expect(render("capture", data)).not.toContain("<figcaption");
    const formatter = templates["capture"]?.formatter;
    if (!formatter) throw new Error("Capture formatter missing");
    expect(formatter.parse(formatter.format(data))).toEqual({
      ...data,
      capture: { ...data.capture, caption: "" },
    });
  });
  test("authored values remain escaped and CSS is fingerprinted and scoped", () => {
    const html = render("run", {
      label: "Ownership",
      items: [1, 2, 3].map((index) => ({
        title: String(index),
        tag: "<script>alert(1)</script>",
        text: "Content",
      })),
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(rizomRuntimeStaticAssets["/styles/brain.css"]).toContain(
      "@scope (.brain-page)",
    );
  });
});
