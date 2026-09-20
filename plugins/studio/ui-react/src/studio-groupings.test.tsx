/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioGroupingContent } from "./studio-groupings";
import { groupingQuery } from "./grouping-url-query";
import { TypeSwitcher, studioMobileSelection } from "./entity-fields";

const common = {
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
  expect(html).toContain("2 entities");
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
  expect(loading).toContain("Preparing collections");
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
