/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WritingArchive, writingSchema } from "../src/writing";

const post = (
  slug: string,
  title: string,
  publishedAt: string | null,
  url?: string,
): Record<string, unknown> => ({
  id: slug,
  entityType: "post",
  content: "---\ntitle: x\n---\nBody",
  created: "2025-01-01T00:00:00.000Z",
  metadata: { title, slug, status: "published", publishedAt },
  frontmatter: { title, excerpt: `Excerpt of ${title}` },
  ...(url ? { url } : {}),
});
const deck = (
  slug: string,
  title: string,
  publishedAt: string | undefined,
  description?: string,
): Record<string, unknown> => ({
  id: slug,
  entityType: "deck",
  content: "---\ntitle: x\n---\nSlides",
  created: "2024-06-01T00:00:00.000Z",
  metadata: { title, slug, status: "published" },
  frontmatter: {
    title,
    status: "published",
    ...(publishedAt ? { publishedAt } : {}),
    ...(description ? { description } : {}),
  },
  url: `/decks/${slug}`,
});

function render(data: unknown): string {
  return renderToStaticMarkup(
    <WritingArchive {...writingSchema.parse(data)} />,
  );
}

describe("the Writing archive", () => {
  const data = {
    posts: [
      post(
        "play",
        "The Future of Work is Play",
        "2026-03-03T00:00:00.000Z",
        "/essays/play",
      ),
      post(
        "contracts",
        "Social contracts",
        "2025-11-20T00:00:00.000Z",
        "/essays/contracts",
      ),
    ],
    decks: [
      deck(
        "core",
        "Community, Collective, Core",
        "2026-04-14T00:00:00.000Z",
        "Core Principles of Rizom",
      ),
      deck("kickoff", "Kick Off 2025", undefined, "Outcome Based Working"),
    ],
  };

  test("keeps the entity fields the site builder links by", () => {
    const parsed = writingSchema.parse(data);
    expect(parsed.posts[0]).toMatchObject({
      entityType: "post",
      content: "---\ntitle: x\n---\nBody",
      metadata: { slug: "play" },
    });
  });

  test("puts essays and presentations on one thread, newest first", () => {
    const html = render(data);
    const titles = [...html.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
    expect(titles).toEqual([
      "Community, Collective, Core",
      "The Future of Work is Play",
      "Social contracts",
      "Kick Off 2025",
    ]);
  });

  test("draws essays as lanterns with their excerpt and presentations as plain nodes", () => {
    const html = render(data);
    expect(html).toContain('<ol class="thread-list">');
    expect(html).toContain(
      '<li class="piece piece--essay" style="animation-delay:0.55s"><span class="piece__mark" aria-hidden="true"></span><a href="/essays/play"><small>Essay · 3 March 2026</small><b>The Future of Work is Play</b><span>Excerpt of The Future of Work is Play</span></a></li>',
    );
    expect(html).toContain(
      '<li class="piece piece--deck" style="animation-delay:0.4s"><span class="piece__mark" aria-hidden="true"></span><a href="/decks/core"><small>Presentation · 14 April 2026</small><b>Community, Collective, Core</b><span>Core Principles of Rizom</span></a></li>',
    );
    // A presentation without a date falls back to when it was made.
    expect(html).toContain("<small>Presentation · 1 June 2024</small>");
  });

  test("filters by kind without script, starting on everything", () => {
    const html = render(data);
    expect(html).toContain(
      '<fieldset class="archive__filter"><legend>Show</legend>',
    );
    expect(html).toContain(
      '<label><input type="radio" name="show" checked="" value="all"/>Everything</label>',
    );
    expect(html).toContain(
      '<label><input type="radio" name="show" value="essay"/>Essays</label>',
    );
    expect(html).toContain(
      '<label><input type="radio" name="show" value="deck"/>Presentations</label>',
    );
    expect(html).not.toContain("<script");
    expect(html).toContain('href="/styles/writing.css"');
  });

  test("a piece the builder has not linked yet still reads, and an empty archive says so", () => {
    const html = render({
      posts: [post("draft", "Unlinked", null)],
      decks: [],
    });
    expect(html).toContain(
      "<div><small>Essay · 1 January 2025</small><b>Unlinked</b>",
    );
    expect(render({})).toContain(
      '<p class="archive__empty">Nothing published yet.</p>',
    );
  });

  test("authored text is escaped", () => {
    const html = render({
      posts: [post("x", "<script>alert(1)</script>", null)],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
