import { expect, test } from "bun:test";
import { homePathFor } from "../src/auth-service-plugin";

test("a new operator lands in Studio when the brain has one, else at the site", () => {
  expect(homePathFor([{ pluginId: "studio", fullPath: "/studio" }])).toBe(
    "/studio",
  );
  expect(homePathFor([{ pluginId: "dashboard", fullPath: "/dashboard" }])).toBe(
    "/",
  );
});
