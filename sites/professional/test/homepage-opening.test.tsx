import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { loadHomepageOpening } from "../src/datasources/homepage-opening";
import {
  HomepageListLayout,
  type HomepageListData,
} from "../src/templates/homepage-list";
import { professionalSiteConfigSchema } from "../src/config";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { professionalProfileSchema } from "../src/schemas";
import { homepageOpeningSchema } from "../src/schemas/homepage-opening";

const origin = "https://brain.test";
const content =
  "---\ntitle: A different opening\ntopics:\n  - Talk about research\n---\nAn *authored* opening with a [link](https://example.com).\n<script>alert('unsafe')</script><img src=x onerror=alert(1)>[bad](javascript:alert(1))";
function entity(
  visibility: BaseEntity["visibility"] = "public",
  markdown = content,
): BaseEntity {
  return {
    id: "ask-content",
    entityType: "ask-content",
    visibility,
    content: markdown,
    metadata: {},
    contentHash: "test",
    created: "2026-09-21T10:00:00.000Z",
    updated: "2026-09-21T10:00:00.000Z",
  };
}
function context(record: BaseEntity | null = entity()): ServicePluginContext {
  const context = createMockServicePluginContext({
    returns: { entityService: { getEntity: record } },
  });
  const routes = ["GET", "POST"].map((method) => ({
    pluginId: "contact",
    fullPath: "/contact",
    definition: {
      path: "/contact",
      method: method === "GET" ? ("GET" as const) : ("POST" as const),
      public: true,
      preview: true,
      handler: (): Response => new Response(),
    },
  }));
  return {
    ...context,
    siteUrl: origin,
    preferLocalUrls: false,
    previewUrl: "https://preview.brain.test",
    webRoutes: { getRoutes: () => routes },
    identity: {
      ...context.identity,
      getAppInfo: async () => ({
        ...(await context.identity.getAppInfo()),
        endpoints: [
          {
            pluginId: "contact",
            label: "Contact",
            url: `${origin}/contact`,
            priority: 50,
            visibility: "public" as const,
          },
        ],
      }),
    },
  };
}
const page: HomepageListData = {
  profile: professionalProfileSchema.parse({
    name: "Owner name",
    description: "Short metadata description",
    tagline: "Existing headline",
    intro: "Existing introduction",
  }),
  posts: [],
  decks: [],
  postsListUrl: "/essays",
  decksListUrl: "/presentations",
  sections: {},
  cta: {
    heading: "Keep in touch",
    buttonText: "Email",
    buttonLink: "mailto:owner@example.com",
  },
};

describe("contact-first homepage", () => {
  it("is opt-in and preserves the existing page when unconfigured", () => {
    expect(professionalSiteConfigSchema.parse({}).homepageOpening).toBe(false);
    const html = renderToStaticMarkup(<HomepageListLayout {...page} />);
    expect(html).toContain("Existing headline");
    expect(html).not.toContain('href="/contact"');
  });
  it("server-renders public authored Markdown, attribution and functional topic links without chat", async () => {
    const runtime = context();
    const opening = await loadHomepageOpening(
      { entityService: runtime.entityService, publishedOnly: true },
      runtime,
    );
    const html = renderToStaticMarkup(
      <HomepageListLayout
        {...page}
        homepageOpening
        opening={homepageOpeningSchema.parse(opening)}
      />,
    );
    expect(html).toContain("A different opening");
    expect(html).toContain("<em>authored</em>");
    expect(html).toContain("Owner name");
    expect(html).toContain(`href="${origin}/contact"`);
    expect(html).toContain("Talk about research");
    expect(html).not.toContain("Existing headline");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("/guest");
    expect(html).not.toContain("textarea");
  });
  it("omits missing/private/invalid/empty copy without a profile-derived replacement", async () => {
    for (const record of [
      null,
      entity("restricted"),
      entity("public", "---\ntopics: wrong-type\n---"),
      entity("public", ""),
    ]) {
      const runtime = context(record);
      const opening = await loadHomepageOpening(
        { entityService: runtime.entityService },
        runtime,
      );
      expect(opening).toBeNull();
      const html = renderToStaticMarkup(
        <HomepageListLayout
          {...page}
          homepageOpening
          opening={homepageOpeningSchema.parse(opening)}
        />,
      );
      expect(html).not.toContain("Existing headline");
      expect(html).not.toContain('href="/contact"');
    }
  });
  it("uses the advertised loopback endpoint for a local preview, not the deployment's HTTPS domain", async () => {
    const runtime = context();
    const localOrigin = "http://127.0.0.1:3000";
    const appInfo = await runtime.identity.getAppInfo();
    const local = {
      ...runtime,
      preferLocalUrls: true,
      localSiteUrl: localOrigin,
      identity: {
        ...runtime.identity,
        getAppInfo: async (): ReturnType<
          typeof runtime.identity.getAppInfo
        > => ({
          ...appInfo,
          endpoints: [
            {
              pluginId: "contact",
              label: "Contact",
              url: `${localOrigin}/contact`,
              priority: 50,
              visibility: "public" as const,
            },
          ],
        }),
      },
    };
    const result = await loadHomepageOpening(
      { entityService: runtime.entityService, publishedOnly: false },
      local,
    );
    expect(result?.contactUrl).toBe(`${localOrigin}/contact`);
  });

  it("omits the opening when the route or matching environment origin is unavailable", async () => {
    const runtime = context();
    expect(
      await loadHomepageOpening(
        { entityService: runtime.entityService, publishedOnly: false },
        runtime,
      ),
    ).toBeNull();
    runtime.webRoutes.getRoutes = mock(() => []);
    expect(
      await loadHomepageOpening(
        { entityService: runtime.entityService },
        runtime,
      ),
    ).toBeNull();
  });
});
