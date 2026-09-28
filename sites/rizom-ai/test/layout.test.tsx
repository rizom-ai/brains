/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { AiLayout } from "../src/layout";
import type { RizomLayoutProps } from "../src/rizom";

const siteInfo: RizomLayoutProps["siteInfo"] = {
  title: "Rizom",
  description: "Own the intelligence you already have.",
  url: "https://rizom.ai",
  copyright: "© 2026 Rizom",
  navigation: { primary: [], secondary: [] },
};

function renderChrome(path: string): string {
  return render(
    <AiLayout
      sections={[]}
      title="Rizom"
      description={siteInfo.description}
      path={path}
      siteInfo={siteInfo}
    />,
  );
}

function bar(html: string): string {
  return html.slice(html.indexOf("<header"), html.indexOf("</header>"));
}

describe("the one bar", () => {
  test("carries the rooms and the archive, one call to action and the theme toggle", () => {
    const html = bar(renderChrome("/"));
    for (const href of ["/brain", "/work", "/foundation", "/writing"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('href="/work#audit"');
    expect(html).toContain("Book an audit");
    expect(html).toContain('id="themeToggle"');
    expect(html).toContain('aria-label="Toggle color theme"');
    expect(html).toMatch(/<a href="\/"[^>]*aria-label="Rizom home"/);
  });

  test("marks the current room and no other", () => {
    const work = bar(renderChrome("/work"));
    expect(work).toMatch(/href="\/work"[^>]*aria-current="page"/);
    expect(work.match(/aria-current="page"/g)).toHaveLength(1);
    expect(bar(renderChrome("/"))).not.toContain('aria-current="page"');
    expect(bar(renderChrome("/writing"))).toMatch(
      /href="\/writing"[^>]*aria-current="page"/,
    );
  });

  test("has no room strip, no room nameplate and no network page", () => {
    const html = renderChrome("/brain");
    expect(html).not.toContain("faces-strip");
    expect(html).not.toContain(">brain</span>");
    expect(html).not.toContain('href="/network"');
    expect(html.match(/<nav /g)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  test("keeps the room's light on the page", () => {
    expect(renderChrome("/work")).toContain('data-room="work"');
    expect(renderChrome("/foundation")).toContain('data-room="foundation"');
    expect(renderChrome("/")).toContain('data-room="brain"');
  });
});

describe("the story shell", () => {
  test("wraps a story page's sections beside its drawing, with the reading thread", () => {
    const html = renderChrome("/foundation");
    expect(html).toContain('class="story"');
    expect(html).toContain('class="chapters"');
    expect(html).toContain('class="figure foundation-org" data-stage="0"');
    expect(html).toContain('class="rail"');
    expect(html).toContain('href="/styles/story.css"');
    expect(html).not.toContain("mycelium-rail");
    expect(html).not.toContain("side-nav-dot");
  });

  test("leaves pages without a story on the plain shell", () => {
    const html = renderChrome("/brain");
    expect(html).not.toContain('class="story"');
    expect(html).not.toContain('class="rail"');
    expect(html).toContain('href="/styles/brain.css"');
  });

  test("the footer names the audit and drops the network", () => {
    const html = renderChrome("/");
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain("The Knowledge Audit");
    expect(footer).toContain('href="/work#audit"');
    expect(footer).not.toContain('href="/network"');
    expect(footer).not.toContain("The workshop");
  });
});
