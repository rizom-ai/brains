import { describe, expect, it } from "bun:test";
import { DashboardAssetRegistry } from "../src/dashboard-assets";

describe("DashboardAssetRegistry", () => {
  it("creates deterministic host-owned content-addressed URLs", () => {
    const first = new DashboardAssetRegistry("/ops/");
    const second = new DashboardAssetRegistry("/ops");

    const firstUrls = first.createRenderUrls({
      themeCSS: ":root { --accent: lime; }",
    });
    const secondUrls = second.createRenderUrls({
      themeCSS: ":root { --accent: lime; }",
    });

    expect(firstUrls).toEqual(secondUrls);
    expect(firstUrls.dashboardStyles).toMatch(
      /^\/ops\/assets\/dashboard\.[a-f0-9]{64}\.css$/,
    );
    expect(firstUrls.dashboardScript).toMatch(
      /^\/ops\/assets\/dashboard\.[a-f0-9]{64}\.js$/,
    );
    expect(firstUrls.themeStyles).toMatch(
      /^\/ops\/assets\/theme\.[a-f0-9]{64}\.css$/,
    );
  });

  it("keeps the pre-paint climate bootstrap out of the deferred client asset", async () => {
    const registry = new DashboardAssetRegistry("/dashboard");
    const urls = registry.createRenderUrls({});
    const route = registry
      .getRoutes()
      .find((candidate) => candidate.path === urls.dashboardScript);

    expect(route).toBeDefined();
    if (!route) throw new Error("Expected dashboard client asset route");
    const response = await route.handler(
      new Request(`http://brain${urls.dashboardScript}`),
    );
    const script = await response.text();

    expect(script).not.toContain("console.climate");
    expect(script).toContain("/api/console/jump");
  });

  it("serves immutable typed theme assets and supports ETag revalidation", async () => {
    const registry = new DashboardAssetRegistry("/dashboard");
    const urls = registry.createRenderUrls({
      themeCSS: ".dashboard { color: red; }",
    });
    const path = urls.themeStyles;
    if (!path) throw new Error("Expected theme stylesheet URL");
    const route = registry
      .getRoutes()
      .find((candidate) => candidate.path === path);

    expect(route).toBeDefined();
    const response = await route?.handler(new Request(`http://brain${path}`));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe(
      "text/css; charset=utf-8",
    );
    expect(response?.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response?.text()).toBe(".dashboard { color: red; }");

    const etag = response?.headers.get("ETag") ?? "";
    const notModified = await route?.handler(
      new Request(`http://brain${path}`, {
        headers: { "If-None-Match": etag },
      }),
    );
    expect(notModified?.status).toBe(304);
    expect(await notModified?.text()).toBe("");
  });
});
