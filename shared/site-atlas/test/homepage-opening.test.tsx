import { describe, expect, it, mock, spyOn } from "bun:test";
import type { ContactFormDiscovery } from "@brains/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockServicePluginContext } from "@brains/plugins/test";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import {
  loadAskContent,
  loadHomepageOpening,
} from "../src/datasources/homepage-opening";
import { homepageOpeningSchema } from "../src/schemas/homepage-opening";
import { HomepageAtlas } from "../src/templates/homepage-atlas";

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
function advertise(
  runtime: ServicePluginContext,
  changes: Partial<ContactFormDiscovery> = {},
): void {
  spyOn(runtime.messaging, "send").mockResolvedValue({
    success: true,
    data: {
      origin,
      routes: [
        { path: "/contact", method: "GET", public: true, preview: true },
        { path: "/contact", method: "POST", public: true, preview: true },
      ],
      ...changes,
    },
  });
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
  advertise(context);
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

describe("authored opening", () => {
  it("server-renders public authored Markdown and functional topic links without chat", async () => {
    const runtime = context();
    const opening = homepageOpeningSchema.parse(
      await loadHomepageOpening(
        { entityService: runtime.entityService, publishedOnly: true },
        runtime,
      ),
    );
    if (!opening) throw new Error("fixture opening must load");
    const html = renderToStaticMarkup(
      <HomepageAtlas opening={opening} atlas={null} owner="Owner name" />,
    );
    expect(html).toContain("A different opening");
    expect(html).toContain("<em>authored</em>");
    // The site's header already says whose page this is.
    expect(html).not.toContain("Owner name");
    expect(html).toContain(`href="${origin}/contact"`);
    expect(html).toContain("Talk about research");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("/guest");
    expect(html).not.toContain("<textarea");
  });
  it("carries the owner's heading over published FAQs, or none", async () => {
    const authored = context(
      entity("public", "---\nfaqHeading: Asked before\n---\nAn opening."),
    );
    const opening = homepageOpeningSchema.parse(
      await loadHomepageOpening(
        { entityService: authored.entityService, publishedOnly: true },
        authored,
      ),
    );
    expect(opening?.faqHeading).toBe("Asked before");
    const unwritten = context();
    expect(
      homepageOpeningSchema.parse(
        await loadHomepageOpening(
          { entityService: unwritten.entityService, publishedOnly: true },
          unwritten,
        ),
      )?.faqHeading,
    ).toBeNull();
  });
  it("omits missing/private/invalid/empty copy without a profile-derived replacement", async () => {
    for (const record of [
      null,
      entity("restricted"),
      entity("public", "---\ntopics: wrong-type\n---"),
      entity("public", ""),
    ]) {
      const runtime = context(record);
      expect(
        await loadHomepageOpening(
          { entityService: runtime.entityService },
          runtime,
        ),
      ).toBeNull();
    }
  });
  it("reads the authored copy alone, without a door, for a page that docks the box itself", async () => {
    const runtime = context();
    const copy = await loadAskContent({ entityService: runtime.entityService });
    expect(copy?.title).toBe("A different opening");
    expect(copy?.topics).toEqual(["Talk about research"]);
    expect(copy).not.toHaveProperty("contactUrl");
    const missing = context(entity("restricted"));
    expect(
      await loadAskContent({ entityService: missing.entityService }),
    ).toBeNull();
  });
  it("uses the local site URL for a local preview, not the deployment's HTTPS domain", async () => {
    const runtime = context();
    const localOrigin = "http://127.0.0.1:3000";
    advertise(runtime, { origin: localOrigin });
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

  it("links a preview build's door to the preview host the form also serves", async () => {
    const runtime = context();
    const result = await loadHomepageOpening(
      { entityService: runtime.entityService, publishedOnly: false },
      runtime,
    );
    expect(result?.contactUrl).toBe("https://preview.brain.test/contact");
  });

  it("keeps the authored opening, without a door, where the form is not reachable", async () => {
    const runtime = context();
    // A form that does not serve preview cannot back a preview door.
    advertise(runtime, {
      routes: [
        { path: "/contact", method: "GET", public: true, preview: false },
        { path: "/contact", method: "POST", public: true, preview: false },
      ],
    });
    const preview = await loadHomepageOpening(
      { entityService: runtime.entityService, publishedOnly: false },
      runtime,
    );
    expect(preview?.title).toBe("A different opening");
    expect(preview?.contactUrl).toBeNull();
    advertise(runtime, { routes: [] });
    const production = await loadHomepageOpening(
      { entityService: runtime.entityService },
      runtime,
    );
    expect(production?.title).toBe("A different opening");
    expect(production?.contactUrl).toBeNull();
  });

  it("renders where a separate worker builds the site, which advertises no endpoints", async () => {
    const runtime = context();
    const appInfo = await runtime.identity.getAppInfo();
    // Endpoint advertisement is registered by the web process only.
    const worker = {
      ...runtime,
      webRoutes: { getRoutes: mock(() => []) },
      identity: {
        ...runtime.identity,
        getAppInfo: async (): ReturnType<
          typeof runtime.identity.getAppInfo
        > => ({ ...appInfo, endpoints: [] }),
      },
    };
    const preview = await loadHomepageOpening(
      { entityService: runtime.entityService, publishedOnly: false },
      worker,
    );
    expect(preview?.contactUrl).toBe("https://preview.brain.test/contact");
    const production = await loadHomepageOpening(
      { entityService: runtime.entityService, publishedOnly: true },
      worker,
    );
    expect(production?.contactUrl).toBe(`${origin}/contact`);
  });
});
