/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeMapWidget } from "../src/widgets/knowledge-map";

test("invalid knowledge-map payloads retain the exact compiled empty-state message", () => {
  for (const data of [null, "invalid"]) {
    const html = renderToStaticMarkup(<KnowledgeMapWidget data={data} />);
    expect(html).toContain("Nothing to show yet.");
    expect(html).toMatch(/^<p class="[^"]+">/);
    expect(html).not.toContain('class="muted"');
    expect(html).not.toContain("<svg");
  }
});
