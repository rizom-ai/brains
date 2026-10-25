/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

function renderActFour(content?: Record<string, unknown>): string {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const section = group?.sections["act-four"];
  if (!section) throw new Error("the home group has no act-four section");
  const Section = section.component;
  return render(
    <Section
      {...section.schema.parse(
        content ?? site.content?.["home"]?.["act-four"] ?? {},
      )}
    />,
  );
}

describe("Act IV, the fourth act", () => {
  test("follows Act III on the home route", () => {
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

  test("tells the museum's numbers on the feature card", () => {
    const html = renderActFour();
    expect(html).toContain("And then, finally, the right people got it.");
    expect(html).toContain("Art &amp; Culture · New Taipei City Art Museum");
    expect(html).toContain('158,000<span class="tf-unit">+</span>');
    expect(html).toContain(
      "impressions for contemporary art, from people who thought it wasn’t for them.",
    );
  });

  test("pins two more figures, the second in ink", () => {
    const html = renderActFour();
    expect(html).toContain('100,000<span class="tf-unit">+</span>');
    expect(html).toContain('7.7<span class="tf-unit">%</span>');
    expect(html).toContain("tf-card tf-card--figure tf-card--ink");
  });

  test("tells Rizom's story with the jargon struck out, and its photo when named", () => {
    const fallback = site.content?.["home"]?.["act-four"] ?? {};
    const html = renderActFour();
    expect(html).toContain("Tech &amp; AI · Rizom");
    expect(html).toContain("Academic idea → <em>obvious problem.</em>");
    expect(html).toContain(
      "<s>“Transactive Memory Systems”</s> became “what would your team forget?”",
    );
    expect(html).not.toContain("<img");
    const withPhoto = renderActFour({
      ...fallback,
      story: {
        ...JSON.parse(JSON.stringify(fallback["story"] ?? {})),
        photo: "![](entity://image/rizom-workshop)",
      },
    });
    expect(withPhoto).toContain('src="/images/rizom-workshop.webp"');
  });

  test("leaves out the placeholder testimonial and links to stories that do not exist", () => {
    const html = renderActFour();
    expect(html).not.toContain("TESTIMONIAL");
    expect(html).not.toContain("Read the story");
    expect(html).not.toContain("Read the full stories");
    expect(html).not.toContain("<a ");
  });
});
