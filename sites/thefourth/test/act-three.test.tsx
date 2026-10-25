/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

function renderActThree(content?: Record<string, unknown>): string {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const section = group?.sections["act-three"];
  if (!section) throw new Error("the home group has no act-three section");
  const Section = section.component;
  return render(
    <Section
      {...section.schema.parse(
        content ?? site.content?.["home"]?.["act-three"] ?? {},
      )}
    />,
  );
}

describe("Act III, enter the guide", () => {
  test("follows Act II on the home route", () => {
    expect(site.routes[0]?.sections?.map((section) => section.id)).toEqual([
      "cover",
      "act-one",
      "act-two",
      "act-three",
      "act-four",
      "crossroads",
      "epilogue",
    ]);
  });

  test("brings in the guide and the order of the spells", () => {
    const html = renderActThree();
    expect(html).toContain("Act III");
    expect(html).toContain("Enter the guide");
    expect(html).toContain("Then, a slightly strange guide appeared.");
    expect(html).toContain(
      "Every hero gets one. Ours knows three spells, and casts them in this order:",
    );
  });

  test("casts See, Tell and Reach, each with its mark, alternating sides", () => {
    const html = renderActThree();
    const spells = [
      ...html.matchAll(/class="tf-guide-spell( tf-guide-spell--mirrored)?"/g),
    ];
    expect(spells.map((match) => Boolean(match[1]))).toEqual([
      false,
      true,
      false,
    ]);
    expect(html).toContain(">See.</span>");
    expect(html).toContain(">Tell.</span>");
    expect(html).toContain(">Reach.</span>");
    expect(html).toContain("tf-mark--glass");
    expect(html).toContain("tf-mark--lantern");
    expect(html).toContain("tf-mark--plane");
    expect(html).toContain("The fourth dimension");
    expect(html).toContain(
      "A new angle on what you already have. Our Communication Diagnosis, built on ContentDNA™.",
    );
  });

  test("names the worlds it works in, without links to pages that do not exist", () => {
    const html = renderActThree();
    expect(html).toContain("Which world are you from?");
    for (const sector of [
      "Sustainability &amp; Impact",
      "Tech &amp; AI",
      "Silver Care",
      "Art &amp; Culture",
      "Creators",
    ]) {
      expect(html).toContain(`${sector}</li>`);
    }
    expect(html).not.toContain('href="#"');
  });
});
