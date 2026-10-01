import { afterEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { HOMEPAGE_ATLAS_SCRIPT, SiteLayout } from "@brains/site-atlas";
import { computeContentHash } from "@brains/utils/hash";
import site from "../src";
import { createOrganizationRuntime } from "../src/plugin";

const harnesses: ReturnType<typeof createPluginHarness>[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.reset();
});
async function installed(): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    dataDir: "/tmp/test-organization-site",
  });
  harnesses.push(harness);
  await harness.installPlugin(createOrganizationRuntime());
  return harness;
}
const owner = "@brains/site-organization:organization-site";

describe("organization site", () => {
  it("opens on the declared atlas homepage in the shared layout", () => {
    expect(site.routes.find((route) => route.path === "/")?.sections).toEqual([
      { id: "homepage", template: `${owner}:homepage`, dataQuery: {} },
    ]);
    expect(site.layouts["default"]).toBe(SiteLayout);
  });
  it("declares public homepage and about templates with qualified local sources", async () => {
    const harness = await installed();
    for (const name of ["homepage", "about"]) {
      const template = harness.getTemplates().get(`${owner}:${name}`);
      expect(template?.dataSourceId).toBe(`@brains/site-organization:${name}`);
      expect(template?.requiredPermission).toBe("public");
      expect(
        harness.getDataSources().has(`@brains/site-organization:${name}`),
      ).toBe(true);
    }
    const about = site.routes.find((route) => route.path === "/about");
    expect(about?.sections).toEqual([
      { id: "about", template: `${owner}:about`, dataQuery: {} },
    ]);
    expect(about?.navigation).toMatchObject({ show: true, slot: "primary" });
  });
  it("lists the agent directory in the main navigation", () => {
    expect(site.entityDisplay["agent"]).toEqual({
      label: "Agent",
      navigation: { slot: "primary" },
    });
  });
  it("ships deferred, content-addressed site-owned atlas presentation", () => {
    const path = `scripts/homepage-atlas.${computeContentHash(HOMEPAGE_ATLAS_SCRIPT).slice(0, 12)}.js`;
    expect(site.staticAssets?.[path]).toBe(HOMEPAGE_ATLAS_SCRIPT);
    expect(site.headScripts).toEqual([
      `<script src="/${path}" defer></script>`,
    ]);
  });
  it("accepts homepage data after the builder links agents", async () => {
    const harness = await installed();
    const template = harness.getTemplates().get(`${owner}:homepage`);
    expect(
      template?.schema.safeParse({
        profile: { name: "Team Brain POC Team" },
        opening: {
          title: null,
          introduction: "A small team.",
          topics: [],
          contactUrl: null,
        },
        map: {
          agents: [
            {
              id: "partner-brain",
              entityType: "agent",
              content: "",
              metadata: { slug: "partner-brain-io" },
              name: "Partner Brain",
              kind: "team",
              status: "approved",
              x: 50,
              y: 20,
              constellation: null,
              url: "/agents/partner-brain-io",
              typeLabel: "Agent",
              listUrl: "/agents",
              listLabel: "Agents",
            },
          ],
          constellations: [],
        },
      }).success,
    ).toBe(true);
  });
});
