import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import {
  sitePackageSchema,
  type SiteLayoutInfo,
} from "@brains/site-composition";
import rizomAiSite, {
  RizomAiLayout,
  rizomAiRoutes,
  rizomAiTemplates,
} from "../src";

const siteInfo: SiteLayoutInfo = {
  title: "Rizom",
  description: "Build the agent that represents you",
  // Distinctive value: tests assert the chrome renders THIS, proving the
  // signature line is entity-driven rather than hardcoded in the layout.
  copyright: "SIGNATURE-FROM-SITE-INFO",
  // Entity plugins register slot-based nav entries like these; the
  // two-tier chrome must NOT surface them.
  navigation: {
    primary: [{ label: "Topics", href: "/topics", priority: 10 }],
    secondary: [{ label: "Posts", href: "/posts", priority: 10 }],
  },
};

function renderLayout(path: string): string {
  return render(
    <RizomAiLayout
      sections={[]}
      title="Rizom"
      description=""
      path={path}
      siteInfo={siteInfo}
    />,
  );
}

describe("rizomAiSite package", () => {
  it("is a valid site package", () => {
    expect(sitePackageSchema.safeParse(rizomAiSite).success).toBe(true);
  });

  it("serves the consolidated sitemap: /, /work, /foundation", () => {
    const byId = new Map(rizomAiSite.routes.map((route) => [route.id, route]));
    expect(byId.get("home")?.path).toBe("/");
    expect(byId.get("work")?.path).toBe("/work");
    expect(byId.get("foundation")?.path).toBe("/foundation");
  });

  it("ships every template its routes reference (self-contained package)", () => {
    const refs = rizomAiRoutes.flatMap((route) =>
      (route.sections ?? []).map((section) => section.template),
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toStartWith("rizom-ai-site:");
      const key = ref.slice("rizom-ai-site:".length);
      expect(rizomAiTemplates[key]).toBeDefined();
    }
  });

  it("renders every route without content entities (fallbacks or dataQuery)", () => {
    for (const route of rizomAiRoutes) {
      expect(route.sections?.length).toBeGreaterThan(0);
      for (const section of route.sections ?? []) {
        expect(section.content ?? section.dataQuery).toBeDefined();
      }
    }
  });

  it("serves /writing as the published index backed by the blog datasource", () => {
    const route = rizomAiRoutes.find((r) => r.id === "writing");
    expect(route?.path).toBe("/writing");

    const section = route?.sections?.[0];
    expect(section?.template).toBe("rizom-ai-site:writing");
    expect(section?.dataQuery).toMatchObject({ entityType: "post" });

    // The site contributes only the look — the query logic stays in blog.
    expect(rizomAiTemplates["writing"]?.dataSourceId).toBe("blog:entities");
  });

  it("keeps site-content entity ids unambiguous across all routes", () => {
    const entityIds = rizomAiRoutes.flatMap((route) =>
      (route.sections ?? []).map((section) => `${route.id}:${section.id}`),
    );
    expect(new Set(entityIds).size).toBe(entityIds.length);
  });

  it("keeps the shared Rizom runtime plugin id", () => {
    expect(rizomAiSite.plugin().id).toBe("rizom-site");
  });
});

describe("RizomAiLayout", () => {
  it("renders the org-level faces strip with all three rooms", () => {
    const html = renderLayout("/");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/work"');
    expect(html).toContain('href="/foundation"');
    expect(html).toContain("one practice · three faces");
  });

  it("sets data-room per route so the theme can switch accents", () => {
    expect(renderLayout("/")).toContain('data-room="platform"');
    expect(renderLayout("/work")).toContain('data-room="work"');
    expect(renderLayout("/work/deep-link")).toContain('data-room="work"');
    expect(renderLayout("/foundation")).toContain('data-room="foundation"');
  });

  it("marks the active face from the current path", () => {
    expect(renderLayout("/")).toContain('aria-current="page">Platform');
    expect(renderLayout("/work")).toContain('aria-current="page">Work');
    expect(renderLayout("/foundation")).toContain(
      'aria-current="page">Foundation',
    );
  });

  it("shows the old domain as the room nameplate", () => {
    expect(renderLayout("/work")).toContain("work");
    expect(renderLayout("/foundation")).toContain("foundation");
  });

  it("shows only the face's own contextual links, never entity nav", () => {
    const home = renderLayout("/");
    expect(home).toContain("Docs ↗");
    expect(home).toContain(">Writing<");
    expect(home).not.toContain("Workshop");
    expect(home).not.toContain(">Topics<");
    expect(home).not.toContain(">Posts<");

    const work = renderLayout("/work");
    expect(work).toContain("Workshop");
    expect(work).toContain("Contact");
    expect(work).not.toContain("Docs ↗");
    expect(work).not.toContain(">Topics<");

    const foundation = renderLayout("/foundation");
    expect(foundation).toContain("Research");
    expect(foundation).toContain("Events");
    expect(foundation).not.toContain("Workshop");
    expect(foundation).not.toContain(">Topics<");
  });

  it("gives the platform the full footer and rooms their siteband", () => {
    const home = renderLayout("/");
    expect(home).toContain("The platform");
    expect(home).toContain("old links redirect");

    const work = renderLayout("/work");
    expect(work).toContain("previously");
    expect(work).toContain("rizom.work");
    expect(work).not.toContain("old links redirect");

    const foundation = renderLayout("/foundation");
    expect(foundation).toContain("rizom.foundation");
  });

  it("renders the site-info signature line everywhere, and no other legal copy", () => {
    for (const path of ["/", "/work", "/foundation"]) {
      const html = renderLayout(path);
      expect(html).toContain("SIGNATURE-FROM-SITE-INFO");
      expect(html).not.toContain("Apache");
      expect(html).not.toContain("Stichting");
      expect(html).not.toContain("Rizom Collective");
    }
  });

  it("sends the work CTA to the real Team Type quiz", () => {
    expect(renderLayout("/work")).toContain(
      'href="https://form.typeform.com/to/NGqo9Fnf"',
    );
  });

  it("renders the mycelium rail hooks", () => {
    expect(renderLayout("/")).toContain("myc-root");
  });
});
