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

describe("the home route", () => {
  test("tells the acts in order after the cover", () => {
    expect(site.routes[0]?.sections?.map((section) => section.id)).toEqual([
      "cover",
      "act-one",
      "act-two",
    ]);
  });
});

describe("Act I, the hero", () => {
  test("opens once upon a time on the hero's work", () => {
    const html = renderSection("act-one");
    expect(html).toContain("Act I");
    expect(html).toContain("The hero");
    expect(html).toContain("Once upon a time,");
    expect(html).toContain("you made something that matters.");
    expect(html).toContain(
      "The product works. The research holds. The impact is real.",
    );
  });

  test("frames the brain's photo in a keyhole, and stands without one", () => {
    const fallback = site.content?.["home"]?.["act-one"] ?? {};
    const withPhoto = renderSection("act-one", {
      ...fallback,
      photo: "![A TWTN athlete mid-jump](entity://image/twtn-athlete)",
    });
    expect(withPhoto).toContain('src="/images/twtn-athlete.webp"');
    expect(withPhoto).toContain('alt="A TWTN athlete mid-jump"');
    expect(withPhoto).toContain("tf-portrait");
    expect(renderSection("act-one")).not.toContain("<img");
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
    expect(html).toContain("Break the spell ✦");
    expect(html).toContain("Smart. True. And nobody listened.");
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
    expect(html).toContain("Try another spell ↻");
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

  test("ships the spell script with the site", () => {
    expect(site.headScripts?.join("\n")).toContain("data-tf-spell");
  });
});
