/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionMembersList } from "./studio-collection-members";

const harbor = {
  id: "harbor",
  entityType: "post",
  frontmatter: { title: "Harbor" },
  displayTitle: "Harbor",
  updated: "2026-11-02T00:00:00.000Z",
};

// An opened series or topic lists the entries it holds, each a link.
describe("a collection's members", () => {
  it("names how many it holds and links each one", () => {
    const html = renderToStaticMarkup(
      <CollectionMembersList
        page={{ count: 1, label: "1 post", total: 1, entities: [harbor] }}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain("Members");
    expect(html).toContain("1 post");
    expect(html).toMatch(/<a href="[^"]*\/entities\/post\/harbor"[^>]*>/);
    expect(html).toContain("Harbor");
  });

  it("says so when it holds nothing yet", () => {
    const html = renderToStaticMarkup(
      <CollectionMembersList
        page={{ count: 0, label: "No posts", total: 0, entities: [] }}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain("No posts");
    expect(html).not.toContain("<a ");
  });
});
