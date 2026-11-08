import { describe, expect, it } from "bun:test";
import { markdownToHtml } from "./markdown-html";

describe("Markdown sanitizer parser boundaries", () => {
  it("applies the image scheme policy to srcset, including renderer output", () => {
    const html = markdownToHtml("![fixture](entity:original)", {
      imageRenderer: () =>
        '<img src="entity:original" srcset="entity:small 1x, https://example.invalid/large.png 2x, mailto:fixture@example.invalid 3x, tel:123 4x" sizes="100vw" onerror="fixture()">',
    });
    expect(html).toContain('src="entity:original"');
    expect(html).toContain(
      'srcset="entity:small 1x, https://example.invalid/large.png 2x"',
    );
    expect(html).toContain('sizes="100vw"');
    expect(html).not.toMatch(/mailto:|tel:|onerror/);
  });

  // Noscript is not in our nonTextTags policy: unwrap it and sanitize its content.
  for (const closing of ["</noscript>", "</NoScRiPt>", "</noscript/>"]) {
    it(`retains sanitized noscript fallback after an implicit ancestor close (${closing})`, () => {
      const html = markdownToHtml(
        `<div>Before<noscript></div><img src="https://example.invalid/fallback.png" onerror="fixture()">fallback${closing}<p>After</p>`,
      );
      expect(html).toBe(
        '<div>Before</div><img src="https://example.invalid/fallback.png" />fallback<p>After</p>',
      );
    });
  }

  it("sanitizes an unterminated noscript fallback without inventing a discard policy", () => {
    const html = markdownToHtml(
      '<div>Before<noscript></div><img src="javascript:fixture()" onerror="fixture()">fallback',
    );
    expect(html).toBe("<div>Before</div><img />fallback");
  });

  it("retains content after a browser-style comment terminator", () => {
    const html = markdownToHtml(
      '<!-- discarded --!><p>Visible<img src="https://example.invalid/image.png" onerror="fixture()"></p>',
    );
    expect(html).toContain("Visible");
    expect(html).toContain('src="https://example.invalid/image.png"');
    expect(html).not.toMatch(/discarded|onerror/);
  });

  it("ends a discarded textarea at a solidus end tag without losing following content", () => {
    const html = markdownToHtml(
      "<textarea>hidden-text</textarea/><p>Visible</p>",
    );
    expect(html).toContain("Visible");
    expect(html).not.toMatch(/hidden-text|<textarea/);
  });

  for (const tag of ["plaintext", "noembed", "noframes"]) {
    it(`keeps ${tag} raw markup as text, not live allowed elements`, () => {
      const html = markdownToHtml(`<${tag}><strong>literal</strong></${tag}>`);
      expect(html).toContain("&lt;strong&gt;literal&lt;/strong&gt;");
      expect(html).not.toContain("<strong>");
      expect(html).not.toContain(`<${tag}>`);
    });
  }

  it("re-sanitizes discarded iframe fallback without allowing script or data images", () => {
    const html = markdownToHtml(
      '<iframe><strong>fallback</strong><script>fixture-marker</script><img src="data:image/svg+xml,fixture" onerror="fixture()"></iframe><p>After</p>',
    );
    expect(html).toContain("<strong>fallback</strong>");
    expect(html).toContain("After");
    expect(html).not.toMatch(
      /<iframe|<script|fixture-marker|data:image|onerror/,
    );
  });

  it("strips foreign namespaces and URL-mutating elements without widening the allowlist", () => {
    const html = markdownToHtml(
      '<svg><a href="javascript:fixture()"><animate attributeName="href" values="#safe;javascript:fixture()"></animate>link</a><foreignObject><p>Visible</p></foreignObject></svg><math><mtext><img src="data:image/svg+xml,fixture" onerror="fixture()"></mtext></math><meta http-equiv="refresh" content="0;url=javascript:fixture()">',
    );
    expect(html).toContain("link");
    expect(html).toContain("Visible");
    expect(html).not.toMatch(
      /<svg|<math|<animate|<meta|javascript:|data:image|onerror|attributeName/i,
    );
  });

  for (const url of [
    "java&#x73;cript:fixture()",
    "java&#9;script:fixture()",
    "&#x2f;&#x2f;example.invalid/path",
    "data:text/html,fixture",
  ]) {
    it(`refuses encoded or disallowed link URL ${url}`, () => {
      const html = markdownToHtml(`<a href="${url}">label</a>`);
      expect(html).toContain("<a>label</a>");
      expect(html).not.toContain("href=");
    });
  }

  it("preserves allowed links and faithfully decodes text without decoding ambiguous attribute entities", () => {
    const html = markdownToHtml(
      '<p>&#128; &#0; &#xD800; &#x1F600; &NotEqualTilde; &amp;</p><a href="https://example.invalid/" title="&notit;">web</a><a href="mailto:fixture@example.invalid">mail</a><a href="tel:123">phone</a>',
    );
    expect(html).toContain("€ � � 😀 ≂̸ &amp;");
    expect(html).toContain('title="&amp;notit;"');
    expect(html).toContain('href="https://example.invalid/"');
    expect(html).toContain('href="mailto:fixture@example.invalid"');
    expect(html).toContain('href="tel:123"');
  });
});
