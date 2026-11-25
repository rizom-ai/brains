/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { scopeEntityReads } from "@brains/entity-service";
import type { BaseEntity } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  ReferenceList,
  referenceListSchema,
  type ReferenceListData,
} from "../src/templates/reference-list";
import { referencePlugins } from "./reference-fixture";

function reference(
  id: string,
  fields: Record<string, unknown> = {},
): BaseEntity {
  return {
    id,
    entityType: "reference",
    content: "",
    created: "2026-11-01T00:00:00.000Z",
    updated: "2026-11-01T00:00:00.000Z",
    visibility: "public",
    contentHash: `hash-${id}`,
    metadata: {
      status: "published",
      title: `Essay ${id}`,
      summary: `What ${id} is about.`,
      author: "Ada Author",
      authorSite: "author.example",
      url: `https://author.example/essays/${id}`,
      publishedAt: "2026-05-02T09:00:00.000Z",
      sourceState: "active",
      sourceUri: `at://did:plc:author/ai.rizom.brain.post/${id}`,
      sourceEntityType: "post",
      sourceEntityId: id,
      ...fields,
    },
  };
}

/** What a site build of the given kind is handed for the section. */
async function section(
  entities: BaseEntity[],
  build: { publishedOnly: boolean },
): Promise<ReferenceListData> {
  const harness = createPluginHarness({});
  for (const plugin of referencePlugins()) await harness.installPlugin(plugin);
  const shell = harness.getMockShell();
  // Stored as the brain stores them: frontmatter written by the type.
  for (const entity of entities) {
    await shell.getEntityService().createEntity({ entity });
  }
  const source = harness.getDataSources().get("references:entities");
  if (!source?.fetch) throw new Error("No references data source");
  // The reads a build is handed: a production build's are published-only.
  return source.fetch({ entityType: "reference" }, referenceListSchema, {
    entityService: scopeEntityReads(shell.getEntityService(), build),
    publishedOnly: build.publishedOnly,
  });
}

const selection = [
  reference("featured"),
  reference("draft", { status: "draft" }),
  reference("withdrawn", { sourceState: "withdrawn" }),
  reference("withdrawn-draft", { status: "draft", sourceState: "withdrawn" }),
];

describe("the references section", () => {
  it("shows a production build only the published entries whose source is active", async () => {
    const data = await section(selection, { publishedOnly: true });

    expect(data.references.map(({ id }) => id)).toEqual(["featured"]);
  });

  it("shows a preview build the drafts too, and never a withdrawn entry", async () => {
    const data = await section(selection, { publishedOnly: false });

    expect(data.references.map(({ id }) => id).sort()).toEqual([
      "draft",
      "featured",
    ]);
  });

  it("lists the newest first", async () => {
    const data = await section(
      [
        reference("older", { publishedAt: "2026-01-01T00:00:00.000Z" }),
        reference("newest", { publishedAt: "2026-09-01T00:00:00.000Z" }),
        reference("middle", { publishedAt: "2026-05-01T00:00:00.000Z" }),
      ],
      { publishedOnly: true },
    );

    expect(data.references.map(({ id }) => id)).toEqual([
      "newest",
      "middle",
      "older",
    ]);
  });

  it("hands the section the display fields and nothing about the source record", async () => {
    const data = await section(
      [reference("essay", { series: "Common Sense" })],
      { publishedOnly: true },
    );

    expect(data).toEqual({
      references: [
        {
          id: "essay",
          kind: "post",
          title: "Essay essay",
          summary: "What essay is about.",
          author: "Ada Author",
          authorSite: "author.example",
          url: "https://author.example/essays/essay",
          publishedAt: "2026-05-02T09:00:00.000Z",
          kicker: "Common Sense",
          status: "published",
        },
      ],
    });
  });

  it("gives each kind a kicker: a post its series, the others what they are", async () => {
    const data = await section(
      [
        reference("in-series", { series: "Common Sense" }),
        reference("plain-post"),
        reference("deck", { sourceEntityType: "deck" }),
        reference("project", { sourceEntityType: "project" }),
        reference("series", { sourceEntityType: "series" }),
      ],
      { publishedOnly: true },
    );

    expect(
      Object.fromEntries(data.references.map(({ id, kicker }) => [id, kicker])),
    ).toEqual({
      "in-series": "Common Sense",
      "plain-post": null,
      deck: "Deck",
      project: "Project",
      series: "Series",
    });
  });

  it("links each entry to its page on the author's site, with its series, author and date", () => {
    const html = render(
      <ReferenceList
        references={[
          {
            id: "essay",
            kind: "post",
            title: "Scale without a centre",
            summary: "How a network grows with no one in the middle.",
            author: "Ada Author",
            authorSite: "author.example",
            url: "https://author.example/essays/scale-without-a-centre",
            publishedAt: "2026-05-02T09:00:00.000Z",
            kicker: "Common Sense",
            status: "published",
          },
        ]}
      />,
    );

    expect(html).toContain(
      'href="https://author.example/essays/scale-without-a-centre"',
    );
    expect(html).toContain("Scale without a centre");
    expect(html).toContain("How a network grows with no one in the middle.");
    expect(html).toContain("Common Sense");
    expect(html).toContain("Ada Author");
    expect(html).toContain("May 2, 2026");
    expect(html).toContain('dateTime="2026-05-02T09:00:00.000Z"');
    // No local detail page: the only link leaves for the author's site.
    expect(html.match(/href="/g)).toHaveLength(1);
  });

  it("marks a draft in a preview, and renders an entry with no summary or series", () => {
    const html = render(
      <ReferenceList
        references={[
          {
            id: "draft",
            kind: "post",
            title: "Not chosen yet",
            summary: null,
            author: "Ada Author",
            authorSite: "author.example",
            url: "https://author.example/essays/draft",
            publishedAt: "2026-05-02T09:00:00.000Z",
            kicker: null,
            status: "draft",
          },
        ]}
      />,
    );

    expect(html).toContain("Not chosen yet");
    expect(html).toContain("Draft");
  });

  it("renders nothing for an empty selection", () => {
    expect(render(<ReferenceList references={[]} />)).toBe("");
  });
});
