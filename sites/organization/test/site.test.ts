import { describe, expect, it } from "bun:test";
import { createPluginHarness, installSiteRuntime } from "@brains/plugins/test";
import {
  HOMEPAGE_ATLAS_SCRIPT,
  HOMEPAGE_ATLAS_SCRIPT_PATH,
  SiteLayout,
} from "@brains/site-atlas";
import site from "../src";

async function installed(): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    dataDir: "/tmp/test-organization-site",
  });
  installSiteRuntime(harness, site, {
    packageName: "@brains/site-organization",
  });
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

  it("tells visitors about the team on /about, from the main navigation", async () => {
    const about = site.routes.find((route) => route.path === "/about");
    expect(about?.sections).toEqual([
      { id: "about", template: "organization-site:about", dataQuery: {} },
    ]);
    expect(about?.navigation).toMatchObject({ show: true, slot: "primary" });
    const harness = await installed();
    const template = harness.getTemplates().get("organization-site:about");
    expect(template?.dataSourceId).toBe("organization-site:about");
    expect(template?.requiredPermission).toBe("public");
    expect(harness.getDataSources().has("organization-site:about")).toBe(true);
  });

  it("lists the agent directory in the main navigation", () => {
    expect(site.entityDisplay["agent"]).toEqual({
      label: "Agent",
      navigation: { slot: "primary" },
    });
  });

  it("keeps the publishing archives out of the main navigation", () => {
    expect(site.entityDisplay).toMatchObject({
      series: { label: "Series", navigation: { slot: "secondary" } },
      project: { label: "Project", navigation: { slot: "secondary" } },
      "social-post": {
        label: "Social Post",
        pluralName: "social-posts",
        navigation: { slot: "secondary" },
      },
      newsletter: { label: "Newsletter", navigation: { slot: "secondary" } },
      summary: { label: "Summary", navigation: { slot: "secondary" } },
    });
  });

  it("registers the homepage with its datasource and ships the atlas script", async () => {
    const harness = await installed();
    const template = harness.getTemplates().get("organization-site:homepage");
    expect(template?.dataSourceId).toBe("organization-site:homepage");
    expect(template?.requiredPermission).toBe("public");
    expect(template?.runtimeScripts).toEqual([
      { src: HOMEPAGE_ATLAS_SCRIPT_PATH, defer: true },
    ]);
    expect(template?.staticAssets?.[HOMEPAGE_ATLAS_SCRIPT_PATH]).toBe(
      HOMEPAGE_ATLAS_SCRIPT,
    );
    expect(harness.getDataSources().has("organization-site:homepage")).toBe(
      true,
    );
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

  it("accepts the homepage with its published FAQs, and with none", async () => {
    const harness = await installed();
    const template = harness.getTemplates().get("organization-site:homepage");
    const homepage = {
      profile: { name: "Team Brain POC Team" },
      opening: {
        title: null,
        introduction: "A small team.",
        topics: [],
        contactUrl: null,
      },
    };
    const faq = {
      id: "guests",
      question: "Can I bring a guest?",
      answer: "Yes.",
    };
    expect(template?.schema.parse({ ...homepage, faqs: [faq] })).toMatchObject({
      faqs: [faq],
    });
    expect(template?.schema.parse(homepage)).toMatchObject({ faqs: [] });
  });
});
