import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutPage, type AboutPageProps } from "../src/templates/about-page";

const page: AboutPageProps = {
  title: "About Team Brain POC Team",
  headDescription: "A small team.",
  description: "A small team validating shared knowledge capture.",
  story: "We keep what we learn in *one* living memory.",
  facts: [
    {
      heading: "Purpose",
      kind: "text",
      value: "Keep the team's knowledge alive.",
    },
    {
      heading: "Focus areas",
      kind: "tags",
      values: ["Research", "Operations"],
    },
    {
      heading: "Working principles",
      kind: "list",
      values: ["Write it down", "Cite the source"],
    },
  ],
  contact: {
    email: "team@example.com",
    website: "https://team.example.com",
    socialLinks: [],
  },
};

describe("about page", () => {
  const html = (props: AboutPageProps = page): string =>
    renderToStaticMarkup(<AboutPage {...props} />);

  it("opens with the title and the description", () => {
    expect(html()).toContain(">About Team Brain POC Team</h1>");
    expect(html()).toContain(
      "A small team validating shared knowledge capture.",
    );
  });

  it("tells the story in prose", () => {
    expect(html()).toContain("<em>one</em>");
  });

  it("sets each fact under its heading, as text, tags or a list", () => {
    expect(html()).toContain(">Purpose</h2>");
    expect(html()).toContain("Keep the team&#x27;s knowledge alive.");
    expect(html()).toContain(">Focus areas</h2>");
    expect(
      html().match(/<li class="[^"]*">(Research|Operations)<\/li>/g),
    ).toHaveLength(2);
    expect(html()).toContain(">Working principles</h2>");
    expect(html()).toContain("<li>Write it down</li>");
  });

  it("leaves out facts with nothing in them", () => {
    const sparse = html({
      ...page,
      facts: [
        { heading: "Purpose", kind: "text", value: "" },
        { heading: "Focus areas", kind: "tags", values: [] },
      ],
    });
    expect(sparse).not.toContain(">Purpose</h2>");
    expect(sparse).not.toContain(">Focus areas</h2>");
    expect(sparse).toContain(">Contact</h2>");
  });

  it("offers the ways to reach the team", () => {
    expect(html()).toContain('href="mailto:team@example.com"');
    expect(html()).toContain('href="https://team.example.com"');
  });

  it("has no grid when there are no facts and no contact", () => {
    const bare = html({
      ...page,
      story: null,
      facts: [],
      contact: { email: null, website: null, socialLinks: null },
    });
    expect(bare).not.toContain("<h2");
    expect(bare).not.toContain("grid");
  });
});
