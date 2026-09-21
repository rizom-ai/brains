/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioGroupingContent } from "./studio-groupings";
import { groupingQuery } from "./grouping-url-query";
import { TypeSwitcher, studioMobileSelection } from "./entity-fields";

const common = {
  basePath: "/studio",
  grouping: {
    key: "clients",
    label: "Clients",
    field: "clients",
    types: ["note", "post"],
  },
  types: [],
  query: groupingQuery(""),
  loading: false,
  initializing: false,
  error: null,
  onChange: (): void => {},
  onOpen: (): void => {},
  onRetry: (): void => {},
};
test("stray markers follow the fresh scoped descriptor without changing rows or counts", () => {
  const render = (values: string[]): string =>
    renderToStaticMarkup(
      <StudioGroupingContent
        {...common}
        page={{
          kind: "catalog",
          grouping: {
            ...common.grouping,
            vocabulary: { multiple: true, values },
          },
          values: [{ value: "Gamma", count: 2 }],
          total: 1,
        }}
      />,
    );
  const closed = render(["Acme"]);
  expect(closed).toContain("Gamma");
  expect(closed).toContain("not in list");
  expect(closed).toContain("2 entries");
  const admitted = render(["Acme", "Gamma"]);
  expect(admitted).not.toContain("not in list");
  expect(admitted).toContain("Gamma");
  expect(admitted).toContain("2 entries");
  const members = renderToStaticMarkup(
    <StudioGroupingContent
      {...common}
      query={groupingQuery("?value=Gamma")}
      page={{
        kind: "members",
        grouping: {
          ...common.grouping,
          vocabulary: { multiple: true, values: ["Acme"] },
        },
        entities: [],
        total: 0,
      }}
    />,
  );
  // Secondary metadata is hidden on phones; keep this warning in the
  // always-visible primary item alongside the count.
  expect(members).toContain(">0 entries · not in list</span>");
});

test("navigation has one grouping destination, distinct from a type with the same key", () => {
  expect(studioMobileSelection("group:post")).toEqual({
    kind: "grouping",
    id: "post",
  });
  expect(studioMobileSelection("type:post")).toEqual({
    kind: "type",
    id: "post",
  });
  const html = renderToStaticMarkup(
    <TypeSwitcher
      types={[]}
      active={null}
      onSelect={() => {}}
      renderMode="desktop"
      groupings={{
        items: [common.grouping],
        active: "clients",
        onSelect: () => {},
      }}
    />,
  );
  expect(html).toContain("Groupings");
  expect(html.match(/Clients/g)).toHaveLength(1);
  expect(html).not.toContain("Acme");
});
test("catalog uses one row per value and offers no entity or collection creation", () => {
  const html = renderToStaticMarkup(
    <StudioGroupingContent
      {...common}
      page={{
        kind: "catalog",
        values: [{ value: "Acme", count: 2 }],
        total: 1,
      }}
    />,
  );
  expect(html).toContain("Acme");
  expect(html).toContain("2 entries");
  // A group row is a link, so it opens in a new tab like any other place.
  expect(html).toContain(
    String.fromCharCode(60) + 'a href="/studio/groups/clients?value=Acme"',
  );
  expect(html).not.toContain("New ");
  expect(html).not.toContain("Delete collection");
});
test("members have mixed-type badges without cross-type publication assumptions", () => {
  const html = renderToStaticMarkup(
    <StudioGroupingContent
      {...common}
      query={groupingQuery("?value=Acme")}
      page={{
        kind: "members",
        total: 2,
        entities: [
          {
            id: "same",
            entityType: "note",
            frontmatter: { title: "Brief" },
            updated: "2026-09-17T00:00:00Z",
          },
          {
            id: "same",
            entityType: "post",
            frontmatter: { title: "Rollout" },
            updated: "2026-09-17T00:00:00Z",
          },
        ],
      }}
    />,
  );
  expect(html).toContain('aria-label="Collection navigation"');
  expect(html).toContain("← Clients");
  expect(html).toContain("Brief");
  expect(html).toContain("Rollout");
  expect(html).toContain("Note");
  expect(html).toContain("Post");
  expect(html).not.toContain("Draft");
  expect(html).not.toContain("Status");
});
test("initializing, failed, and empty are distinct states", () => {
  const loading = renderToStaticMarkup(
    <StudioGroupingContent {...common} initializing loading page={null} />,
  );
  expect(loading).toContain("Preparing groups");
  expect(loading).not.toContain("No clients");
  const failed = renderToStaticMarkup(
    <StudioGroupingContent
      {...common}
      error="Collections are not ready yet."
      page={null}
    />,
  );
  expect(failed).toContain("Retry");
  expect(failed).not.toContain("No clients");
  const empty = renderToStaticMarkup(
    <StudioGroupingContent
      {...common}
      page={{ kind: "catalog", values: [], total: 0 }}
    />,
  );
  expect(empty).toContain("No clients here yet");
  expect(empty).toContain("frontmatter");
});
