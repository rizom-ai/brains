import { expect, test } from "bun:test";
import {
  groupingQuery,
  groupingSearch,
  groupingReturnTarget,
} from "./grouping-url-query";
import { parseStudioPath, studioGroupingPath } from "../../src/studio-paths";

test("group routes are distinct from type routes at every Studio mount", () => {
  for (const base of ["/studio", "/edit", "/"]) {
    const path = studioGroupingPath(base, "post");
    expect(parseStudioPath(path, base)).toEqual({
      kind: "grouping",
      grouping: "post",
    });
    expect(parseStudioPath(path + "/extra", base).kind).toBe("not-found");
  }
});
test("group query preserves exact values, filters, and pagination", () => {
  const query = {
    ...groupingQuery(""),
    value: "\ufeffAcme / 日本語\u0000",
    type: "post",
    q: "heading",
    sort: "created-asc" as const,
    offset: 20,
    limit: 10,
  };
  expect(groupingQuery(groupingSearch(query))).toEqual(query);
  expect(groupingQuery("?value=").value).toBe("");
  expect(groupingQuery("").value).toBeNull();
  expect(groupingQuery("?limit=999&offset=-1")).toEqual(groupingQuery(""));
});
test("escaped return labels never replace the original URL value", () => {
  const value = " Acme, Inc. ";
  const path =
    "/studio/groups/clients" + groupingSearch({ ...groupingQuery(""), value });
  const target = groupingReturnTarget({ studioGroupingPath: path }, "/studio", [
    { key: "clients", label: "Clients" },
  ]);
  expect(target?.label).toBe('"\\u0020Acme,\\u0020Inc.\\u0020"');
  expect(target?.path).toBe(path);
  expect(
    new URL(target?.path ?? "", "https://studio.test").searchParams.get(
      "value",
    ),
  ).toBe(value);
});
test("editor return accepts only an admitted local grouping target", () => {
  const groups = [{ key: "clients", label: "Clients" }];
  const path = "/edit/groups/clients?value=Acme&type=post&offset=20";
  expect(
    groupingReturnTarget({ studioGroupingPath: path }, "/edit", groups),
  ).toEqual({ path, label: "Acme", grouping: "clients" });
  for (const invalid of [
    "https://evil.example/edit/groups/clients",
    "//evil.example/edit/groups/clients",
    "/studio/groups/clients",
    "/edit/groups/hidden",
    "/edit/entities/note",
  ]) {
    expect(
      groupingReturnTarget({ studioGroupingPath: invalid }, "/edit", groups),
    ).toBeNull();
  }
  expect(
    groupingReturnTarget({ studioGroupingPath: path }, "/edit", []),
  ).toBeNull();
});
