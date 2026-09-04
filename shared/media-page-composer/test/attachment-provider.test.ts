import { describe, expect, it } from "bun:test";
import { createElement as h, type JSX } from "react";
import { z } from "@brains/utils/zod";
import { createMockEntityService } from "@brains/test-utils";
import { baseEntitySchema } from "@brains/plugins";
import {
  createOgImageProvider,
  createPrintableProvider,
  preferredSlug,
  type MediaAttachmentContext,
  type MediaPageTemplate,
} from "../src";

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const TINY_PDF = Buffer.from("%PDF-1.7\n", "utf-8");
const COVER_DATA_URL = "data:image/png;base64,AAAA";

const widgetSchema = baseEntitySchema.extend({
  metadata: z.object({ title: z.string(), slug: z.string() }),
});
type Widget = z.output<typeof widgetSchema>;

interface WidgetContent {
  title: string;
  brandLabel?: string | undefined;
  coverImageUrl?: string | undefined;
}

function WidgetCard(props: Record<string, unknown>): JSX.Element {
  return h("div", null, String(props["title"]));
}

function createTemplate(): MediaPageTemplate {
  return {
    name: "widget-template",
    pluginId: "test",
    schema: z.object({
      title: z.string(),
      brandLabel: z.string().optional(),
      coverImageUrl: z.string().optional(),
    }),
    renderers: { image: WidgetCard, pdf: WidgetCard },
  };
}

function createWidget(): Widget {
  return {
    id: "widget-1",
    entityType: "widget",
    content: "Body",
    contentHash: "hash",
    visibility: "public",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    metadata: { title: "Civic Signals", slug: "civic-signals" },
  };
}

function createContext(
  options: { domain?: string | undefined; profileName?: string } = {},
): MediaAttachmentContext {
  // Explicit `domain: undefined` must survive, so don't use a default value.
  const domain = "domain" in options ? options.domain : "example.com";
  const { profileName = "Rizom" } = options;

  return {
    entityService: createMockEntityService({
      entityTypes: ["widget", "image"],
      getEntityImpl: async (request) => {
        if (request.entityType === "widget" && request.id === "widget-1") {
          return createWidget();
        }
        if (request.entityType === "image" && request.id === "cover-1") {
          return {
            ...createWidget(),
            entityType: "image",
            id: "cover-1",
            content: COVER_DATA_URL,
          };
        }
        if (request.entityType === "image" && request.id === "not-inline") {
          return {
            ...createWidget(),
            entityType: "image",
            id: "not-inline",
            content: "# a markdown image note",
          };
        }
        return null;
      },
    }),
    themeCSS: "",
    identity: {
      getProfile: (): { name: string } => ({ name: profileName }),
    },
    domain,
  };
}

const WIDGET_OG_CONFIG = {
  sourceEntityType: "widget",
  entitySchema: widgetSchema,
  attachmentType: "og-image",
  template: createTemplate(),
  buildContent: async (
    widget: Widget,
    helpers: {
      brandLabel: string | undefined;
      resolveImageDataUrl: (
        id: string | undefined,
      ) => Promise<string | undefined>;
    },
  ): Promise<WidgetContent> => ({
    title: widget.metadata.title,
    brandLabel: helpers.brandLabel,
    coverImageUrl: await helpers.resolveImageDataUrl("cover-1"),
  }),
  pageTitle: (content: WidgetContent): string => content.title,
  slug: (widget: Widget): string =>
    preferredSlug(widget.metadata.slug, widget.metadata.title),
};

/** Run a provider and report the brand label its content builder was handed. */
async function captureBrandLabel(
  context: MediaAttachmentContext,
): Promise<string | undefined> {
  let brandLabel: string | undefined;
  const provider = createOgImageProvider({
    ...WIDGET_OG_CONFIG,
    buildContent: (widget: Widget, helpers): WidgetContent => {
      brandLabel = helpers.brandLabel;
      return { title: widget.metadata.title };
    },
  })(context, { screenshotPng: async () => TINY_PNG });

  await provider.resolve({
    sourceEntityType: "widget",
    sourceEntityId: "widget-1",
    attachmentType: "og-image",
  });

  return brandLabel;
}

describe("createOgImageProvider", () => {
  it("resolves a source entity into a PNG attachment", async () => {
    let capturedUrl = "";
    let capturedViewport: { width: number; height: number } | undefined;
    let renderedHtml = "";

    const provider = createOgImageProvider(WIDGET_OG_CONFIG)(createContext(), {
      screenshotPng: async (url, viewport) => {
        capturedUrl = url;
        capturedViewport = viewport;
        renderedHtml = await (await fetch(url)).text();
        return TINY_PNG;
      },
    });

    const attachment = await provider.resolve({
      sourceEntityType: "widget",
      sourceEntityId: "widget-1",
      attachmentType: "og-image",
    });

    expect(attachment).toEqual({
      type: "image",
      data: TINY_PNG,
      mimeType: "image/png",
      filename: "civic-signals-og.png",
    });
    // The media route is derived from the source entity type and id.
    expect(capturedUrl).toContain("/_media/og/widget/widget-1/");
    expect(capturedViewport).toEqual({ width: 1200, height: 630 });
    expect(renderedHtml).toContain("Civic Signals");
  });

  it("declares image metadata targeting the ogImageId field", () => {
    const provider = createOgImageProvider(WIDGET_OG_CONFIG)(createContext());

    expect(provider.metadata).toEqual({
      outputEntityType: "image",
      targetField: "ogImageId",
    });
  });

  it("returns undefined for a different attachment type", async () => {
    const provider = createOgImageProvider(WIDGET_OG_CONFIG)(createContext(), {
      screenshotPng: async () => TINY_PNG,
    });

    expect(
      await provider.resolve({
        sourceEntityType: "widget",
        sourceEntityId: "widget-1",
        attachmentType: "printable",
      }),
    ).toBeUndefined();
  });

  it("returns undefined for a different source entity type", async () => {
    const provider = createOgImageProvider(WIDGET_OG_CONFIG)(createContext(), {
      screenshotPng: async () => TINY_PNG,
    });

    expect(
      await provider.resolve({
        sourceEntityType: "gadget",
        sourceEntityId: "widget-1",
        attachmentType: "og-image",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when the source entity is missing", async () => {
    const provider = createOgImageProvider(WIDGET_OG_CONFIG)(createContext(), {
      screenshotPng: async () => TINY_PNG,
    });

    expect(
      await provider.resolve({
        sourceEntityType: "widget",
        sourceEntityId: "gone",
        attachmentType: "og-image",
      }),
    ).toBeUndefined();
  });

  it("passes the domain as the brand label", async () => {
    expect(await captureBrandLabel(createContext())).toBe("example.com");
  });

  it("falls back to the identity profile name when the domain is blank", async () => {
    expect(
      await captureBrandLabel(
        createContext({ domain: "   ", profileName: "Rizom Collective" }),
      ),
    ).toBe("Rizom Collective");
  });

  it("leaves the brand label unset when domain and profile name are blank", async () => {
    expect(
      await captureBrandLabel(
        createContext({ domain: undefined, profileName: "  " }),
      ),
    ).toBeUndefined();
  });

  it("resolves referenced image entities to their data URL", async () => {
    let resolved: string | undefined;
    const provider = createOgImageProvider({
      ...WIDGET_OG_CONFIG,
      buildContent: async (widget: Widget, helpers): Promise<WidgetContent> => {
        resolved = await helpers.resolveImageDataUrl("cover-1");
        return { title: widget.metadata.title };
      },
    })(createContext(), { screenshotPng: async () => TINY_PNG });

    await provider.resolve({
      sourceEntityType: "widget",
      sourceEntityId: "widget-1",
      attachmentType: "og-image",
    });

    expect(resolved).toBe(COVER_DATA_URL);
  });

  it("ignores image references that are not inline data URLs", async () => {
    const seen: Array<string | undefined> = [];
    const provider = createOgImageProvider({
      ...WIDGET_OG_CONFIG,
      buildContent: async (widget: Widget, helpers): Promise<WidgetContent> => {
        seen.push(await helpers.resolveImageDataUrl("not-inline"));
        seen.push(await helpers.resolveImageDataUrl("missing"));
        seen.push(await helpers.resolveImageDataUrl(undefined));
        return { title: widget.metadata.title };
      },
    })(createContext(), { screenshotPng: async () => TINY_PNG });

    await provider.resolve({
      sourceEntityType: "widget",
      sourceEntityId: "widget-1",
      attachmentType: "og-image",
    });

    expect(seen).toEqual([undefined, undefined, undefined]);
  });
});

describe("createPrintableProvider", () => {
  it("resolves a source entity into a PDF attachment", async () => {
    let capturedUrl = "";

    const provider = createPrintableProvider({
      ...WIDGET_OG_CONFIG,
      attachmentType: "printable",
    })(createContext(), {
      renderPdf: async (url) => {
        capturedUrl = url;
        return TINY_PDF;
      },
    });

    const attachment = await provider.resolve({
      sourceEntityType: "widget",
      sourceEntityId: "widget-1",
      attachmentType: "printable",
    });

    expect(attachment).toEqual({
      type: "document",
      data: TINY_PDF,
      mimeType: "application/pdf",
      filename: "civic-signals-printable.pdf",
    });
    expect(capturedUrl).toContain("/_media/printable/widget/widget-1/");
  });

  it("declares document metadata with no target field", () => {
    const provider = createPrintableProvider({
      ...WIDGET_OG_CONFIG,
      attachmentType: "printable",
    })(createContext());

    expect(provider.metadata).toEqual({ outputEntityType: "document" });
  });
});

describe("preferredSlug", () => {
  it("prefers an explicit slug", () => {
    expect(preferredSlug("civic-signals", "Civic Signals")).toBe(
      "civic-signals",
    );
  });

  it("slugifies the title when no slug is set", () => {
    expect(preferredSlug("", "Civic Signals")).toBe("civic-signals");
  });
});
