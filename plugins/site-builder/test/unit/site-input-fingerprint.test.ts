import { describe, expect, test } from "bun:test";
import type { PreparedSiteBuild } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import { computeSiteInputFingerprint } from "../../src/lib/site-input-fingerprint";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";

const preparedBuild = {
  buildId: "build-1",
  preparedAt: "2026-08-31T00:00:00.000Z",
  environment: "production",
  site: {
    title: "Docs",
    description: "Docs",
    copyright: "Rizom",
    navigation: { primary: [], secondary: [] },
  },
  routes: [
    {
      id: "docs",
      path: "/",
      title: "Docs",
      description: "Docs",
      layout: "default",
      fullscreen: false,
      sections: [{ id: "docs", template: "docs:doc-list", data: {} }],
      headScripts: [],
    },
  ],
  images: {},
  staticAssets: {},
  publicAssets: {},
  globalHeadScripts: [],
} satisfies PreparedSiteBuild;

const renderer = (): never => {
  throw new Error("renderer is not executed while fingerprinting");
};
const staticSiteBuilderFactory = (): never => {
  throw new Error("builder is not executed while fingerprinting");
};
const sendMessage = async (): Promise<{ noop: true }> => ({ noop: true });

function fingerprint(renderVersion?: string): string {
  const template: SiteViewTemplate = {
    name: "docs:doc-list",
    pluginId: "docs",
    schema: z.object({}),
    ...(renderVersion ? { renderVersion } : {}),
    renderers: { web: renderer },
  };

  return computeSiteInputFingerprint({
    preparedBuild,
    layouts: {},
    getViewTemplate: () => template,
    staticSiteBuilderFactory,
    sendMessage,
  });
}

describe("computeSiteInputFingerprint", () => {
  test("invalidates retained output when a template gains a render version", () => {
    expect(fingerprint()).not.toBe(fingerprint("latest-update-v1"));
  });

  test("is stable for the same template render version", () => {
    expect(fingerprint("doc-list-v2")).toBe(fingerprint("doc-list-v2"));
  });
});
