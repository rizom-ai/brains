import { createMockEntityService } from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it, mock, spyOn } from "bun:test";
import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createElement as h, type JSX } from "react";
import { z } from "@brains/utils/zod";
import { baseEntitySchema, type AttachmentFile } from "@brains/plugins";
import {
  createOgImageProvider,
  createPrintableProvider,
  preferredSlug,
  type MediaAttachmentContext,
  type MediaContentHelpers,
  type MediaPageTemplate,
} from "../src";

const widgetSchema = baseEntitySchema.extend({
  metadata: z.object({ title: z.string(), slug: z.string() }),
});
type Widget = z.output<typeof widgetSchema>;
const widget: Widget = {
  id: "widget-1",
  entityType: "widget",
  content: "Body",
  contentHash: "hash",
  visibility: "public",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
  metadata: { title: "Civic Signals", slug: "civic-signals" },
};
const request = {
  sourceEntityType: "widget",
  sourceEntityId: "widget-1",
  attachmentType: "og-image",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
function Card(props: Record<string, unknown>): JSX.Element {
  return h(
    "article",
    null,
    String(props["title"]),
    h("img", { src: props["coverImageUrl"] }),
  );
}
const template: MediaPageTemplate = {
  name: "widget",
  pluginId: "test",
  schema: z.object({
    title: z.string(),
    coverImageUrl: z.string().optional(),
    brandLabel: z.string().optional(),
  }),
  renderers: { image: Card, pdf: Card },
};
interface WidgetContent {
  title: string;
  brandLabel: string | undefined;
  coverImageUrl: string | undefined;
}
const config = {
  sourceEntityType: "widget",
  entitySchema: widgetSchema,
  attachmentType: "og-image",
  template,
  buildContent: async (
    entity: Widget,
    helpers: MediaContentHelpers,
  ): Promise<WidgetContent> => ({
    title: entity.metadata.title,
    brandLabel: helpers.brandLabel,
    coverImageUrl: await helpers.resolveImageUrl("cover-1"),
  }),
  pageTitle: (content: Pick<WidgetContent, "title">): string => content.title,
  slug: (entity: Widget): string =>
    preferredSlug(entity.metadata.slug, entity.metadata.title),
};
function setup(
  options: { domain?: string | undefined; profileName?: string } = {},
): {
  context: MediaAttachmentContext;
  files: NonNullable<MediaAttachmentContext["entityService"]["fileAssets"]>;
} {
  const base = createMockEntityPluginContext();
  const service = createMockEntityService({
    entityTypes: ["widget", "image"],
    returns: { readAsset: png },
    getEntityImpl: async (input) => {
      if (input.entityType === "widget" && input.id === "widget-1")
        return widget;
      if (input.entityType === "image" && input.id === "cover-1")
        return {
          ...widget,
          id: "cover-1",
          entityType: "image",
          content: `asset://sha256/${"a".repeat(64)}`,
          metadata: {
            format: "png",
            mediaType: "image/png",
            sizeBytes: png.length,
            width: 1,
            height: 1,
          },
        };
      if (input.id === "not-image")
        return {
          ...widget,
          entityType: "image",
          content: "Not an asset reference",
        };
      return null;
    },
  });
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected file operation");
  };
  const files: NonNullable<
    MediaAttachmentContext["entityService"]["fileAssets"]
  > = {
    download: mock(async ({ outputFile }) => {
      await writeFile(outputFile, png);
      return { sizeBytes: png.length, sha256: "a".repeat(64) };
    }),
    withProducedFile: async (
      directory,
      use,
      options,
    ): ReturnType<typeof use> => {
      const sourceFile = join(directory, "test-output.png");
      await writeFile(sourceFile, png);
      return use(
        { sourceFile, sizeBytes: png.length, sha256: "a".repeat(64) },
        options?.signal ?? new AbortController().signal,
      );
    },
    putHttp: unexpected,
    postHttp: unexpected,
    withAssetFile: unexpected,
    inspect: unexpected,
    publish: unexpected,
    fingerprint: unexpected,
    close: async (): Promise<void> => undefined,
  };
  spyOn(files, "withProducedFile");
  service.fileAssets = files;
  return {
    files,
    context: {
      entityService: service,
      themeCSS: ":root{--fixture:red}",
      domain: "domain" in options ? options.domain : "example.com",
      identity: {
        ...base.identity,
        getProfile: () => ({ name: options.profileName ?? "Rizom" }),
      },
    },
  };
}
const accept = async (file: AttachmentFile): Promise<AttachmentFile> => file;

describe("file-only OG attachment providers", () => {
  it("writes metadata HTML and lends an actor-produced file with file-backed references", async () => {
    const { context, files } = setup();
    const provider = createOgImageProvider(config)(context);
    let root = "";
    assert.ok(files.withProducedFile);
    spyOn(files, "withProducedFile").mockImplementation(
      async (directory, use, options): ReturnType<typeof use> => {
        root = directory;
        const html = await readFile(join(root, "index.html"), "utf8");
        expect(html).toContain("Civic Signals");
        expect(html).toContain("/assets/image-0.png");
        expect(html).not.toContain("data:image");
        expect(await readFile(join(root, "styles/main.css"), "utf8")).toBe(
          context.themeCSS,
        );
        const sourceFile = join(directory, "test-output.png");
        await writeFile(sourceFile, png);
        return use(
          { sourceFile, sizeBytes: png.length, sha256: "a".repeat(64) },
          options?.signal ?? new AbortController().signal,
        );
      },
    );
    const file = await provider.withFile(request, async (value) => {
      expect(await Bun.file(value.source.sourceFile).exists()).toBe(true);
      return value;
    });
    expect(file).toMatchObject({
      type: "image",
      mimeType: "image/png",
      sha256: "a".repeat(64),
      filename: "civic-signals-og.png",
      source: { sizeBytes: png.length },
    });
    expect("resolve" in provider).toBe(false);
    expect(context.entityService.readAsset).not.toHaveBeenCalled();
    expect(files.download).toHaveBeenCalledTimes(1);
    expect(await Bun.file(join(root, "index.html")).exists()).toBe(false);
  });
  it("fails closed without a producer capability", async () => {
    const { context } = setup();
    delete context.entityService.fileAssets;
    await assert.rejects(
      createOgImageProvider(config)(context).withFile(request, accept),
      /not provisioned/,
    );
    expect(context.entityService.readAsset).not.toHaveBeenCalled();
  });
  it("does not acquire files for mismatched or missing sources", async () => {
    const { context, files } = setup();
    const provider = createOgImageProvider(config)(context);
    for (const input of [
      { ...request, attachmentType: "printable" },
      { ...request, sourceEntityType: "other" },
      { ...request, sourceEntityId: "missing" },
    ])
      expect(await provider.withFile(input, accept)).toBeUndefined();
    expect(files.withProducedFile).not.toHaveBeenCalled();
    expect(files.download).not.toHaveBeenCalled();
    expect(provider.metadata).toEqual({
      outputEntityType: "image",
      targetField: "ogImageId",
    });
  });
  it("deduplicates referenced downloads and ignores missing/non-asset images", async () => {
    const { context, files } = setup();
    const seen: Array<string | undefined> = [];
    const provider = createOgImageProvider({
      ...config,
      buildContent: async (entity, helpers) => {
        seen.push(
          await helpers.resolveImageUrl("cover-1"),
          await helpers.resolveImageUrl("cover-1"),
          await helpers.resolveImageUrl("not-image"),
          await helpers.resolveImageUrl("missing"),
          await helpers.resolveImageUrl(undefined),
        );
        return { title: entity.metadata.title };
      },
    })(context);
    await provider.withFile(request, accept);
    expect(seen).toEqual([
      "/assets/image-0.png",
      "/assets/image-0.png",
      undefined,
      undefined,
      undefined,
    ]);
    expect(files.download).toHaveBeenCalledTimes(1);
  });
  it("joins outstanding reference work and preserves content and download failures", async () => {
    const { context, files } = setup();
    const primary = new Error("content failed"),
      secondary = new Error("download failed");
    const started = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    let root = "";
    spyOn(files, "download").mockImplementation(
      async ({ outputFile }): Promise<never> => {
        root = dirname(dirname(outputFile));
        started.resolve();
        await release.promise;
        throw secondary;
      },
    );
    const provider = createOgImageProvider({
      ...config,
      buildContent: (_entity, helpers): never => {
        void helpers.resolveImageUrl("cover-1");
        throw primary;
      },
    })(context);
    let settled = false;
    const rejected = assert.rejects(
      provider.withFile(request, accept).finally(() => {
        settled = true;
      }),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toEqual([primary, secondary]);
        expect(error.cause).toBe(primary);
        return true;
      },
    );
    try {
      await started.promise;
      expect(settled).toBe(false);
    } finally {
      release.resolve();
      await rejected;
    }
    expect(files.withProducedFile).not.toHaveBeenCalled();
    expect(await Bun.file(join(root, "index.html")).exists()).toBe(false);
  });
  it("forwards cancellation before production and preserves a late consumer acknowledgement", async () => {
    const { context, files } = setup();
    const caller = new AbortController();
    const primary = new Error("cancelled during download");
    spyOn(files, "download").mockImplementation(async (): Promise<never> => {
      caller.abort(primary);
      throw primary;
    });
    await assert.rejects(
      createOgImageProvider(config)(context).withFile(request, accept, {
        signal: caller.signal,
      }),
      (error: unknown) => error === primary,
    );
    expect(files.withProducedFile).not.toHaveBeenCalled();
    const next = setup();
    const late = new AbortController();
    expect(
      await createOgImageProvider(config)(next.context).withFile(
        request,
        async (): Promise<string> => {
          late.abort();
          return "acknowledged";
        },
        { signal: late.signal },
      ),
    ).toBe("acknowledged");
  });
  it("holds input files through consumer and producer settlement, retaining failed staging", async () => {
    const { context, files } = setup();
    const consumed = Promise.withResolvers<void>();
    const retire = Promise.withResolvers<void>();
    const primary = new Error("producer retirement failed");
    let root = "";
    spyOn(files, "withProducedFile").mockImplementation(
      async (directory, use, options): ReturnType<typeof use> => {
        root = directory;
        await use(
          {
            sourceFile: join(root, "output.png"),
            sizeBytes: png.length,
            sha256: "a".repeat(64),
          },
          options?.signal ?? new AbortController().signal,
        );
        consumed.resolve();
        await retire.promise;
        throw primary;
      },
    );
    let settled = false;
    const failed = assert.rejects(
      createOgImageProvider(config)(context)
        .withFile(request, async () => {
          expect((await stat(join(root, "assets/image-0.png"))).isFile()).toBe(
            true,
          );
        })
        .finally(() => {
          settled = true;
        }),
      (error: unknown) => error === primary,
    );
    try {
      await consumed.promise;
      expect(settled).toBe(false);
      expect((await stat(join(root, "index.html"))).isFile()).toBe(true);
    } finally {
      retire.resolve();
      await failed;
    }
    expect((await stat(root)).isDirectory()).toBe(true);
  });
  it("bounds reference admission and closes the builder's borrowed helpers", async () => {
    const { context, files } = setup();
    let borrowed: MediaContentHelpers | undefined;
    const provider = createOgImageProvider({
      ...config,
      buildContent: async (entity, helpers) => {
        borrowed = helpers;
        for (let index = 0; index < 16; index++)
          await helpers.resolveImageUrl(`missing-${index}`);
        assert.throws(
          () => helpers.resolveImageUrl("seventeenth"),
          /capacity exceeded/,
        );
        return { title: entity.metadata.title };
      },
    })(context);
    await provider.withFile(request, accept);
    const closed = borrowed;
    assert.ok(closed);
    assert.throws(() => closed.resolveImageUrl("late"), /scope is closed/);
    expect(context.entityService.getEntity).toHaveBeenCalledTimes(17);
    expect(files.download).not.toHaveBeenCalled();
  });
  it("keeps live brand-label semantics", async () => {
    for (const [options, expected] of [
      [{}, "example.com"],
      [{ domain: " ", profileName: "Rizom Collective" }, "Rizom Collective"],
      [{ domain: undefined, profileName: " " }, undefined],
    ] as const) {
      const { context } = setup(options);
      let label: string | undefined;
      await createOgImageProvider({
        ...config,
        buildContent: (entity, helpers) => {
          label = helpers.brandLabel;
          return { title: entity.metadata.title };
        },
      })(context).withFile(request, accept);
      expect(label).toBe(expected);
    }
  });
});

describe("file-only printable provider", () => {
  it("lends PDF facts with a strict render instruction and file-backed references", async () => {
    const { context, files } = setup();
    spyOn(files, "withProducedFile").mockImplementation(
      async (directory, use, options): ReturnType<typeof use> => {
        expect(
          JSON.parse(await readFile(join(directory, "render.json"), "utf8")),
        ).toEqual({ format: "pdf" });
        const html = await readFile(join(directory, "index.html"), "utf8");
        expect(html).toContain("/assets/image-0.png");
        expect(html).not.toContain("data:image");
        return use(
          {
            sourceFile: join(directory, "printed.pdf"),
            sizeBytes: 8,
            sha256: "b".repeat(64),
          },
          options?.signal ?? new AbortController().signal,
        );
      },
    );
    const provider = createPrintableProvider({
      ...config,
      attachmentType: "printable",
    })(context);
    expect(
      await provider.withFile(
        { ...request, attachmentType: "printable" },
        accept,
      ),
    ).toEqual({
      type: "document",
      mimeType: "application/pdf",
      filename: "civic-signals-printable.pdf",
      source: { sourceFile: expect.any(String), sizeBytes: 8 },
      sha256: "b".repeat(64),
    });
    expect("resolve" in provider).toBe(false);
    expect(context.entityService.readAsset).not.toHaveBeenCalled();
    expect(provider.metadata).toEqual({ outputEntityType: "document" });
  });
});

describe("preferredSlug", () => {
  it("prefers the explicit slug or slugifies the title", () => {
    expect(preferredSlug("explicit", "Title")).toBe("explicit");
    expect(preferredSlug("", "Civic Signals")).toBe("civic-signals");
  });
});
