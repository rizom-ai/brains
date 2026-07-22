import { describe, expect, it } from "bun:test";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { SiteHealthWidget } from "../../src/lib/dashboard-widget";

const siteHealth = {
  site: {
    title: "Fern & Fable",
    previewUrl: "https://preview.example.com",
    liveUrl: "https://example.com",
  },
  environments: [
    {
      environment: "preview",
      lastSuccess: {
        completedAt: "2026-07-16T09:00:00.000Z",
        routesBuilt: 18,
        warnings: [],
      },
    },
    {
      environment: "production",
      lastFailure: {
        completedAt: "2026-07-16T08:00:00.000Z",
        message: "Template failed",
      },
    },
  ],
  managementUrl: "/cms/workspaces/site",
};

describe("SiteHealthWidget", () => {
  it("renders a read-only Publishing tab digest with CMS management link", () => {
    const html = render(
      h(SiteHealthWidget, { title: "Site health", data: siteHealth }),
    );

    expect(html).toContain('class="pipeline-digest site-health-widget"');
    expect(html).toContain('aria-label="Site actions"');
    expect(html).toContain("Preview");
    expect(html).toContain("18 routes");
    expect(html).toContain("Template failed");
    expect(html).toContain("Open preview");
    expect(html).toContain("Open live");
    expect(html).toContain("Open in CMS");
    expect(html).toContain("widget-action--primary");
    expect(html).not.toContain("Build preview");
    expect(html).not.toContain("Update live site");
  });
});
