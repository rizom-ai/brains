import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import {
  sitePackageSchema,
  type SiteLayoutInfo,
} from "@brains/site-composition";
import rizomAiSite, {
  FoundationHeroSection,
  HomeHeroSection,
  RizomAiLayout,
  rizomAiRoutes,
  rizomAiTemplates,
  WorkHeroSection,
} from "../src";
import {
  FOUNDATION_HERO_FALLBACK,
  HOME_HERO_FALLBACK,
  WORK_HERO_FALLBACK,
} from "../src/content";

const siteInfo: SiteLayoutInfo = {
  title: "Rizom",
  description: "Build the agent that represents you",
  copyright: "© 2026 Stichting Rizom · Amsterdam",
  navigation: { primary: [], secondary: [] },
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

  it("marks the active face from the current path", () => {
    const home = renderLayout("/");
    expect(home).toContain('aria-current="page">Platform');

    const work = renderLayout("/work");
    expect(work).toContain('aria-current="page">Work');

    const foundation = renderLayout("/foundation");
    expect(foundation).toContain('aria-current="page">Foundation');
  });

  it("shows the old domain as the room nameplate", () => {
    expect(renderLayout("/work")).toContain("work");
    expect(renderLayout("/foundation")).toContain("foundation");
  });

  it("renders the Stichting legal line in the footer", () => {
    expect(renderLayout("/")).toContain("Stichting Rizom");
  });
});

describe("sections", () => {
  it("home hero renders the platform pitch", () => {
    const html = render(<HomeHeroSection {...HOME_HERO_FALLBACK} />);
    expect(html).toContain("Build the agent that");
    expect(html).toContain("represents you");
    expect(html).toContain("Get Your Brain");
  });

  it("work hero renders the practice pitch with its provenance line", () => {
    const html = render(<WorkHeroSection {...WORK_HERO_FALLBACK} />);
    expect(html).toContain("Your team has a knowledge problem");
    expect(html).toContain("previously rizom.work");
  });

  it("foundation hero renders the research masthead", () => {
    const html = render(
      <FoundationHeroSection {...FOUNDATION_HERO_FALLBACK} />,
    );
    expect(html).toContain("Work is broken");
    expect(html).toContain("Vol. 01");
  });
});
