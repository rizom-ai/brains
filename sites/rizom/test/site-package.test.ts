import { describe, expect, it } from "bun:test";
import site, { routes } from "../src";

describe("site-rizom package", () => {
  it("keeps shared routes empty and ships shared runtime assets", () => {
    expect(routes).toEqual([]);
    expect(site.routes).toEqual([]);
    expect(site.staticAssets).toBeDefined();
    expect(site.staticAssets?.["/boot.js"]).toBeString();
    expect(site.staticAssets?.["/canvases/prelude.canvas.js"]).toBeString();
    expect(site.staticAssets?.["/canvases/products.canvas.js"]).toBeString();
  });
});
