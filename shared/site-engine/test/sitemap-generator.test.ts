import { describe, expect, it } from "bun:test";
import { generateSitemap } from "../src";

describe("generateSitemap", () => {
  it("uses the prepared snapshot timestamp for deterministic output", () => {
    const routes = [{ path: "/" }, { path: "/writing" }];
    const preparedAt = "2026-07-22T00:00:00.000Z";

    const first = generateSitemap(routes, "https://example.com", preparedAt);
    const second = generateSitemap(routes, "https://example.com", preparedAt);

    expect(second).toBe(first);
    expect(first).toContain(`<lastmod>${preparedAt}</lastmod>`);
    expect(first).toContain("<loc>https://example.com/writing</loc>");
  });
});
