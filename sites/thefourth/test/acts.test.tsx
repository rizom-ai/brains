/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { z } from "@rizom/site";
import site from "../src";

function renderSection(id: string, content?: Record<string, unknown>): string {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const section = group?.sections[id];
  if (!section) throw new Error(`the home group has no ${id} section`);
  const Section = section.component;
  const props = section.schema.parse(
    content ?? site.content?.["home"]?.[id] ?? {},
  );
  return render(<Section {...props} />);
}

describe("Act I, the hero", () => {
  test("opens once upon a time on the hero's work", () => {
    const html = renderSection("act-one");
    expect(html).toContain("Act I");
    expect(html).toContain("The hero");
    expect(html).toContain("Once upon a time,");
    expect(html).toContain("you made something that matters.");
    expect(html).toContain(
      "The product works. The research holds. The impact is real. Now it needs the right people to understand it.",
    );
  });

  test("hangs a tag on a key: the key is already in what you know", () => {
    const html = renderSection("act-one");
    expect(html).toContain("tf-key-tag");
    expect(html).toContain("The key is already in what you know.");
    expect(html).toContain(
      "We find it, shape it into a story, and hand it to the people your audience trusts.",
    );
  });

  test("starts with a diagnosis by email, and points down to how it works", () => {
    const html = renderSection("act-one");
    expect(html).toContain(
      'href="mailto:nihao.fourth@gmail.com">Start with a diagnosis →</a>',
    );
    expect(html).toContain('href="#guide">How it works ↓</a>');
  });

  test("frames the brain's photo in a keyhole, an eye watching, and stands without one", () => {
    const fallback = site.content?.["home"]?.["act-one"] ?? {};
    const withPhoto = renderSection("act-one", {
      ...fallback,
      photo: "![A TWTN athlete mid-jump](entity://image/twtn-athlete)",
    });
    expect(withPhoto).toContain('src="/images/twtn-athlete.webp"');
    expect(withPhoto).toContain('alt="A TWTN athlete mid-jump"');
    expect(withPhoto).toContain("tf-portrait");
    const html = renderSection("act-one");
    expect(html).not.toContain("<img");
    expect(html).toContain("tf-act-one__sun");
    expect(html).toContain("tf-blink");
  });
});

describe("Act II, the curse of jargon", () => {
  test("says the first spell in jargon, marking the words to break", () => {
    const html = renderSection("act-two");
    expect(html).toContain("Act II");
    expect(html).toContain(
      "But when you told the world, it sounded like this:",
    );
    expect(html).toContain('data-jargon="true">Transactive </span>');
    expect(html).toContain('data-jargon="false">We </span>');
    expect(html).toContain("Smart. True. And nobody listened.");
  });

  test("unlocks it with a key", () => {
    const html = renderSection("act-two");
    expect(html).toMatch(
      /<button type="button" class="tf-btn tf-btn--ink tf-btn--large" data-tf-break=""><span class="tf-btn__key" aria-hidden="true"><svg[^]*<\/svg><\/span>Unlock it<\/button>/,
    );
    expect(html).not.toContain("tf-snip");
  });

  test("holds the translation behind the keyhole, lit in the spell's color", () => {
    const html = renderSection("act-two");
    expect(html).toContain(
      "So we translated it into what they needed to hear:",
    );
    expect(html).toContain(
      "If your most experienced person left tomorrow, what would your team forget?",
    );
    expect(html).toContain("We find out before it happens.");
    expect(html).toContain('data-light="red"');
    expect(html).toContain("Tech &amp; AI · 01/03");
    expect(html).toContain("Try another ↻");
  });

  test("offers to unlock the visitor's own, by email", () => {
    expect(renderSection("act-two")).toContain(
      'href="mailto:nihao.fourth@gmail.com">Unlock yours →</a>',
    );
  });

  test("hands every spell to the browser script", () => {
    const html = renderSection("act-two");
    const json =
      /<script type="application\/json" data-tf-spells="">([^<]*)<\/script>/.exec(
        html,
      )?.[1];
    const spells = z
      .array(z.object({ sector: z.string() }))
      .parse(JSON.parse(json ?? "[]"));
    expect(spells.map((spell) => spell.sector)).toEqual([
      "Tech & AI",
      "Art & Culture",
      "Sustainability & Impact",
    ]);
  });

  test("ships the spell script, scattering the words by the viewport's width", () => {
    const scripts = site.headScripts?.join("\n") ?? "";
    expect(scripts).toContain("data-tf-spell");
    expect(scripts).toContain("window.innerWidth / 1300");
  });
});
