import { describe, expect, it } from "bun:test";
import { renderGuestChatPage } from "../src/chat-page";

describe("standalone guest page shell", () => {
  it("provides a headerless fallback without inventing site chrome", () => {
    const html = renderGuestChatPage({
      apiPath: "/api/chat",
      name: "Rizom AI",
      siteLabel: "rizom.ai",
    });
    expect(html).toContain('data-guest-name="Rizom AI"');
    expect(html).toContain('data-guest-label="rizom.ai"');
    expect(html).not.toContain('class="guest-masthead"');
    expect(html).not.toContain("<header");
    expect(html).toContain("<main data-web-chat-root");
    // The guest page bundle, not the signed-in app visitors never use.
    expect(html).toContain('src="/ask/assets/ask.js"');
    expect(html).toContain('href="/ask/assets/ask.css"');
    expect(html).not.toContain("/ask/assets/app.");
    expect(html).not.toContain("fonts.googleapis.com");
  });

  it("escapes identity metadata and retains a generic fallback", () => {
    const html = renderGuestChatPage({
      apiPath: "/api/chat",
      name: '<img src=x onerror="alert(1)">',
      siteLabel: '"<script>bad()</script>',
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>bad()");
    expect(html).toContain("&lt;img");
    expect(renderGuestChatPage({ apiPath: "/api/chat" })).toContain(
      'data-guest-name="the Brain"',
    );
  });
});
