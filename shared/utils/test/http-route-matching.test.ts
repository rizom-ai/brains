import { expect, it } from "bun:test";
import { matchHttpRoute } from "../src/http-utils";

it("prefers exact paths, then the longest segment prefix, and preserves identity", () => {
  const routes = [
    { path: "/", match: "prefix" },
    { path: "/pages", match: "prefix" },
    { path: "/pages/deep/", match: "prefix" },
    { path: "/pages/deep/exact", match: "exact" },
  ] satisfies Array<{ path: string; match: "exact" | "prefix" }>;
  expect(matchHttpRoute(routes, "/pages/deep/exact", (route) => route)).toBe(
    routes[3],
  );
  expect(matchHttpRoute(routes, "/pages/deep/child", (route) => route)).toBe(
    routes[2],
  );
  expect(matchHttpRoute(routes, "/pages", (route) => route)).toBe(routes[1]);
  expect(matchHttpRoute(routes, "/pages-other", (route) => route)).toBe(
    routes[0],
  );
  const exact = [{ path: "/only" }];
  expect(matchHttpRoute(exact, "/only", (route) => route)).toBe(exact[0]);
  expect(
    matchHttpRoute(exact, "/only/child", (route) => route),
  ).toBeUndefined();
});
