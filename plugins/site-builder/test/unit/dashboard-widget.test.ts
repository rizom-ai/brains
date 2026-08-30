import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  SiteHealthWidget,
  siteHealthDigest,
} from "../../src/lib/dashboard-widget";

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
  managementUrl: "/studio/workspaces/site",
};

describe("SiteHealthWidget", () => {
  it("renders a read-only Publishing tab digest with Studio management link", () => {
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
    expect(html).toContain("Open in Studio");
    expect(html).toContain("widget-action--primary");
    expect(html).not.toContain("Build preview");
    expect(html).not.toContain("Update live site");
  });

  it("shows the generation selected by the active published output", () => {
    const html = render(
      h(SiteHealthWidget, {
        title: "Site health",
        data: {
          ...siteHealth,
          environments: [
            {
              environment: "production",
              publication: {
                state: "published",
                buildId: "generation-837",
                publishedAt: "2026-08-30T15:15:18.000Z",
                routesBuilt: 46,
                warnings: [],
              },
              lastSuccess: {
                completedAt: "2026-08-26T14:43:49.345Z",
                routesBuilt: 46,
                warnings: [],
              },
            },
          ],
        },
      }),
    );

    expect(html).toContain("generation-837");
    expect(html).toContain("46 published routes");
    expect(html).toContain("2026-08-30T15:15:18.000Z");
  });

  it("keeps the digest tone on the current attempt while counting retained failures as attention", () => {
    const digest = siteHealthDigest({
      ...siteHealth,
      environments: [
        {
          environment: "preview",
          active: {
            jobId: "job-retry",
            state: "queued",
            requestedAt: "2026-07-16T10:00:00.000Z",
          },
          lastFailure: {
            jobId: "job-failed",
            completedAt: "2026-07-16T09:00:00.000Z",
            message: "Template failed",
          },
        },
        {
          environment: "production",
          lastFailure: {
            jobId: "job-live-failed",
            completedAt: "2026-07-16T08:00:00.000Z",
            message: "Publish failed",
          },
        },
      ],
    });

    expect(digest.items[0]).toEqual({
      label: "Preview",
      value: "queued",
      tone: "good",
    });
    expect(digest.items[1]).toEqual({
      label: "Live",
      value: "failed",
      tone: "warn",
    });
    expect(digest.attention).toBe(2);
  });

  it("does not present a previous failure as the detail for a queued retry", () => {
    const html = render(
      h(SiteHealthWidget, {
        title: "Site health",
        data: {
          ...siteHealth,
          environments: [
            {
              environment: "production",
              active: {
                jobId: "job-retry",
                state: "queued",
                requestedAt: "2026-07-16T10:00:00.000Z",
              },
              lastFailure: {
                jobId: "job-failed",
                completedAt: "2026-07-16T09:00:00.000Z",
                message: "Template failed",
              },
            },
          ],
        },
      }),
    );

    expect(html).toContain("queued · job-retry");
    expect(html).toContain("Previous build failures");
    expect(html).toContain("job-failed");
    expect(html).not.toContain('<small class="muted">Template failed</small>');
  });

  it("distinguishes cancellation from a build failure", () => {
    const html = render(
      h(SiteHealthWidget, {
        title: "Site health",
        data: {
          ...siteHealth,
          environments: [
            {
              environment: "preview",
              lastCancellation: {
                completedAt: "2026-07-16T09:00:00.000Z",
                message: "Superseded by a newer preview site build",
              },
            },
          ],
        },
      }),
    );

    expect(html).toContain("cancelled");
    expect(html).toContain("Superseded by a newer preview site build");
    expect(html).not.toContain("Needs attention");
  });
});
