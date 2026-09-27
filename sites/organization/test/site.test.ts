import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  HOMEPAGE_ATLAS_SCRIPT,
  HOMEPAGE_ATLAS_SCRIPT_PATH,
  SiteLayout,
} from "@brains/site-atlas";
import site, { OrganizationSitePlugin } from "../src";

async function installed(): Promise<
  ReturnType<typeof createPluginHarness<OrganizationSitePlugin>>
> {
  const harness = createPluginHarness<OrganizationSitePlugin>({
    dataDir: "/tmp/test-organization-site",
  });
  await harness.installPlugin(new OrganizationSitePlugin({}));
  return harness;
}

describe("organization site", () => {
  it("opens on the atlas homepage, in the shared site layout", () => {
    const home = site.routes.find((route) => route.path === "/");
    expect(home?.sections).toEqual([
      {
        id: "homepage",
        template: "organization-site:homepage",
        dataQuery: {},
      },
    ]);
    expect(site.layouts["default"]).toBe(SiteLayout);
  });

  it("lists the agent directory in the main navigation", () => {
    expect(site.entityDisplay["agent"]).toEqual({
      label: "Agent",
      navigation: { slot: "primary" },
    });
  });

  it("registers the homepage with its datasource and ships the atlas script", async () => {
    const harness = await installed();
    const template = harness.getTemplates().get("organization-site:homepage");
    expect(template?.dataSourceId).toBe("organization:homepage");
    expect(template?.requiredPermission).toBe("public");
    expect(template?.runtimeScripts).toEqual([
      { src: HOMEPAGE_ATLAS_SCRIPT_PATH, defer: true },
    ]);
    expect(template?.staticAssets?.[HOMEPAGE_ATLAS_SCRIPT_PATH]).toBe(
      HOMEPAGE_ATLAS_SCRIPT,
    );
    expect(harness.getDataSources().has("organization:homepage")).toBe(true);
  });

  it("accepts the homepage with the radar once site-builder has linked its agents", async () => {
    const harness = await installed();
    const template = harness.getTemplates().get("organization-site:homepage");
    const result = template?.schema.safeParse({
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
    });
    expect(result?.success).toBe(true);
  });
});
