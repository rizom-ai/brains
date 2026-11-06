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

  test("brings in the guide and its three ways in", () => {
    const html = renderActThree();
    expect(html).toContain('<section id="guide"');
    expect(html).toContain("Act III");
    expect(html).toContain("Enter the guide");
    expect(html).toContain(
      "Then, a slightly strange guide appeared, with three ways in.",
    );
    expect(html).toContain(
      "See it clearly, tell it well, reach the people who matter. In that order.",
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
    expect(html).toContain("tf-mark--eye");
    expect(html).toContain("tf-mark--screen");
    expect(html).toContain("tf-mark--handset");
    expect(html).toContain("tf-blink");
    expect(html).toContain("tf-talk");
    expect(html).toContain("The fourth dimension");
    expect(html).toContain(
      "A new angle on what you already have. Our Communication Diagnosis, built on ContentDNA™.",
    );
  });

  test("names each way in's program in bold, without links or a list of programs", () => {
    const html = renderActThree();
    for (const program of [
      "Communication Diagnosis",
      "Positioning &amp; Playbook",
      "Creator Match",
    ]) {
      expect(html).toContain(
        `<strong class="tf-guide-spell__program">${program}</strong>`,
      );
    }
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Explore all programs");
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
