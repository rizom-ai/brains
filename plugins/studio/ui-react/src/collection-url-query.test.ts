import { expect, it } from "bun:test";
import { collectionQuery, collectionSearch } from "./collection-url-query";

it("round-trips folder segments and explicit search scope without touching stored IDs", () => {
  const query = collectionQuery(
    `?prefix=${encodeURIComponent(JSON.stringify(["book-1", "part/with%sign"]))}&scope=collection&q=shared&offset=25`,
  );
  expect(query.prefix).toEqual(["book-1", "part/with%sign"]);
  expect(query.scope).toBe("collection");
  expect(collectionQuery(collectionSearch(query))).toEqual(query);
});

it("restores normalized collection offsets from links", () => {
  expect(collectionQuery("?offset=25").offset).toBe(25);
  expect(collectionQuery("?offset=74").offset).toBe(50);
  expect(collectionQuery("?offset=74&limit=10").offset).toBe(70);
  expect(collectionSearch(collectionQuery("?offset=25"))).toBe("?offset=25");
  expect(collectionSearch(collectionQuery(""))).toBe("");
});

it("round-trips search, visibility, status, and sorting without carrying transient mode flags", () => {
  const query = collectionQuery(
    "?q=notes+%26+ideas&visibility=restricted&status=draft&sort=created-asc&offset=25&mode=create",
  );
  expect(collectionQuery(collectionSearch(query))).toEqual(query);
  expect(query.q).toBe("notes & ideas");
  expect(collectionSearch(query)).not.toContain("mode");
});

it("falls back to defaults for invalid filters or unsafe paging", () => {
  for (const search of [
    "offset=-25",
    "offset=NaN",
    "offset=Infinity",
    "offset=1.5",
    "offset=9007199254740992",
    "limit=0",
    "limit=101",
    "sort=arbitrary",
    "visibility=admin",
    `q=${"x".repeat(201)}`,
  ]) {
    expect(collectionQuery(`?${search}`)).toEqual(collectionQuery(""));
  }
});
