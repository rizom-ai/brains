import { describe, expect, test } from "bun:test";
import type { PreparedRoute, PreparedSiteEnvelope } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import {
  computeSiteInputFingerprint,
  fingerprintPreparedRoute,
} from "../../src/lib/site-input-fingerprint";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";

const envelope = {
  buildId: "build-1",
  preparedAt: "2026-08-31T00:00:00.000Z",
  environment: "production",
  site: {
    represents: "anchor",
    title: "Docs",
    description: "Docs",
    copyright: "Rizom",
    navigation: { primary: [], secondary: [] },
  },
  images: {},
  staticAssets: {},
  publicAssets: {},
  globalHeadScripts: [],
} satisfies PreparedSiteEnvelope;

const docsPage: PreparedRoute = {
  id: "docs",
  path: "/",
  language: "en",
  title: "Docs",
  description: "Docs",
  layout: "default",
  fullscreen: false,
  sections: [{ id: "docs", template: "docs:doc-list", data: {} }],
  headScripts: [],
};

const renderer = (): never => {
  throw new Error("renderer is not executed while fingerprinting");
};
const staticSiteBuilderFactory = (): never => {
  throw new Error("builder is not executed while fingerprinting");
};
const sendMessage = async (): Promise<{ noop: true }> => ({ noop: true });

function fingerprint(rendererIdentity: string): string {
  const template: SiteViewTemplate = {
    name: "docs:doc-list",
    pluginId: "docs",
    schema: z.object({}),
    renderers: { web: renderer },
  };

  return computeSiteInputFingerprint({
    envelope,
    routeDigests: [fingerprintPreparedRoute(docsPage)],
    templates: ["docs:doc-list"],
    layouts: {},
    getViewTemplate: () => template,
    staticSiteBuilderFactory,
    sendMessage,
    rendererIdentity,
  });
}

describe("computeSiteInputFingerprint", () => {
  test("renders again under another renderer process, whose code may differ", () => {
    expect(fingerprint("process-a")).not.toBe(fingerprint("process-b"));
  });

  test("is stable within one renderer process", () => {
    expect(fingerprint("process-a")).toBe(fingerprint("process-a"));
  });
});

describe("fingerprintPreparedRoute", () => {
  function withRoutes(routes: PreparedRoute[]): string {
    return computeSiteInputFingerprint({
      envelope,
      routeDigests: routes.map(fingerprintPreparedRoute),
      templates: ["docs:doc-list"],
      layouts: {},
      getViewTemplate: () => undefined,
      staticSiteBuilderFactory,
      sendMessage,
      rendererIdentity: "process-a",
    });
  }

  function page(text: string): PreparedRoute {
    return {
      language: "en",
      headScripts: [],
      title: text,
      description: text,
      layout: "default",
      fullscreen: false,
      id: `page-${text}`,
      path: `/${text}`,
      sections: [
        {
          id: "detail",
          template: "docs:doc-list",
          data: { body: text, nested: { items: [1, text] } },
        },
      ],
    };
  }

  test("is the same for equal routes whose keys come in another order", () => {
    const original = page("eins");
    const reordered: ReturnType<typeof page> = {
      headScripts: [],
      sections: [
        {
          data: { nested: { items: [1, "eins"] }, body: "eins" },
          template: "docs:doc-list",
          id: "detail",
        },
      ],
      fullscreen: false,
      layout: "default",
      description: "eins",
      title: "eins",
      path: original.path,
      id: original.id,
      language: "en",
    };
    expect(fingerprintPreparedRoute(reordered)).toBe(
      fingerprintPreparedRoute(page("eins")),
    );
  });

  test("changes when the route's data changes, however deep", () => {
    const changed = page("eins");
    const [section] = changed.sections;
    if (!section) throw new Error("Expected a section");
    expect(
      fingerprintPreparedRoute({
        ...changed,
        sections: [
          { ...section, data: { ...section.data, nested: { items: [2] } } },
        ],
      }),
    ).not.toBe(fingerprintPreparedRoute(changed));
  });

  test("the site's fingerprint follows every page's data", () => {
    const pages = ["eins", "zwei", "drei"].map(page);
    const changed = [...pages.slice(0, 2), page("vier")];
    expect(withRoutes(pages)).toBe(
      withRoutes(["eins", "zwei", "drei"].map(page)),
    );
    expect(withRoutes(changed)).not.toBe(withRoutes(pages));
  });

  test("the site's fingerprint follows the order of its pages", () => {
    const pages = ["eins", "zwei"].map(page);
    expect(withRoutes([...pages].reverse())).not.toBe(withRoutes(pages));
  });
});
