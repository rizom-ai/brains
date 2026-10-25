/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

function renderSection(id: string, content?: Record<string, unknown>): string {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const section = group?.sections[id];
  if (!section) throw new Error(`the home group has no ${id} section`);
  const Section = section.component;
  return render(
    <Section
      {...section.schema.parse(content ?? site.content?.["home"]?.[id] ?? {})}
    />,
  );
}

const fallback = (id: string): Record<string, unknown> =>
  JSON.parse(JSON.stringify(site.content?.["home"]?.[id] ?? {}));

describe("the story's end", () => {
  test("closes the home route with the crossroads and the epilogue", () => {
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
});

describe("the crossroads", () => {
  test("asks which way under the spotlight, among the signposts", () => {
    const html = renderSection("crossroads");
    expect(html).toContain("Your turn");
    expect(html).toContain("The crossroads");
    expect(html).toContain("Now you’re standing at a crossroads.");
    expect(html).toContain("Which <em>way?</em>");
    expect(html).toContain("THIS WAY");
    expect(html).toContain("THAT WAY");
    expect(html).toContain("YOUR WAY");
  });

  test("offers the brand test only once it has a link", () => {
    expect(renderSection("crossroads")).not.toContain("Take the test");
    expect(renderSection("crossroads")).not.toContain("three minutes");
    const html = renderSection("crossroads", {
      ...fallback("crossroads"),
      test: {
        ...JSON.parse(JSON.stringify(fallback("crossroads")["test"] ?? {})),
        href: "/brand-test",
      },
    });
    expect(html).toContain('href="/brand-test"');
    expect(html).toContain("Take the test →");
    expect(html).toContain(
      "Find out what kind of brand you are in three minutes.",
    );
  });
});

describe("the epilogue", () => {
  test("begins the visitor's fourth act", () => {
    const html = renderSection("epilogue");
    expect(html).toContain("Epilogue");
    expect(html).toContain("To be continued");
    expect(html).toContain("And so, your fourth act begins.");
    expect(html).toContain("Every hero<br/>needs a <em>guide.</em>");
  });

  test("introduces the guides, with their portraits when the brain has them", () => {
    expect(renderSection("epilogue")).toContain(
      "Your guides, Sam &amp; Becca. We took the wrong turns so you don’t have to.",
    );
    expect(renderSection("epilogue")).not.toContain("<img");
    const html = renderSection("epilogue", {
      ...fallback("epilogue"),
      guides: [
        { photo: "![Samantha Shao](entity://image/samantha-shao)" },
        { photo: "![Becca Chen](entity://image/becca-chen)" },
      ],
    });
    expect(html).toContain('src="/images/samantha-shao.webp"');
    expect(html).toContain('alt="Becca Chen"');
    expect(html).not.toContain("Meet us");
  });

  test("starts the fourth act by email", () => {
    const html = renderSection("epilogue");
    expect(html).toContain(
      'href="mailto:nihao.fourth@gmail.com">Start your fourth act →</a>',
    );
    expect(html).toContain(
      'href="mailto:nihao.fourth@gmail.com">nihao.fourth@gmail.com</a>',
    );
  });
});
