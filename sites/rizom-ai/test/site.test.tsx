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
  copyright: "© 2026 Stichting Rizom · Amsterdam",
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

  it("renders every route without content entities (static fallbacks)", () => {
    for (const route of rizomAiRoutes) {
      expect(route.sections?.length).toBeGreaterThan(0);
      for (const section of route.sections ?? []) {
        expect(section.content).toBeDefined();
      }
    }
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
    expect(home).toContain("Stichting Rizom");
    expect(home).toContain("The platform");
    expect(home).toContain("old links redirect");

    const work = renderLayout("/work");
    expect(work).toContain("previously");
    expect(work).toContain("rizom.work");
    expect(work).not.toContain("old links redirect");

    const foundation = renderLayout("/foundation");
    expect(foundation).toContain("rizom.foundation");
    expect(foundation).toContain("Stichting Rizom");
  });

  it("renders the mycelium rail hooks", () => {
    expect(renderLayout("/")).toContain("myc-root");
  });
});
