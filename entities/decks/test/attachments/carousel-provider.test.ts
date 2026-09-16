import { describe, expect, it, spyOn, mock, type Mock } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPluginHarness } from "@brains/plugins/test";
import type { AttachmentFile, EntityPluginContext } from "@brains/plugins";
import { DecksPlugin, type DecksPluginDeps } from "../../src/plugin";
import { DeckCarouselAttachmentProvider } from "../../src/attachments/carousel-provider";
import type { DeckEntity } from "../../src/schemas/deck";

const sampleDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  visibility: "public",
  content:
    "---\ntitle: Test Deck\nstatus: draft\nslug: test-deck\n---\n# Slide 1\n\n---\n\n# Slide 2",
  contentHash: "deck-hash",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  metadata: { title: "Test Deck", slug: "test-deck", status: "draft" },
};
const request = {
  sourceEntityType: "deck",
  sourceEntityId: "deck-1",
  attachmentType: "carousel",
};
const accept = async (file: AttachmentFile): Promise<AttachmentFile> => file;
interface CapturedPage {
  html: string;
  css: string;
  directory: string;
}
type FileAssets = NonNullable<
  EntityPluginContext["entityService"]["fileAssets"]
>;
interface CarouselFixture {
  context: EntityPluginContext;
  service: EntityPluginContext["entityService"];
  pages: CapturedPage[];
  produce: Mock<NonNullable<FileAssets["withProducedFile"]>>;
  buffered: EntityPluginContext["entityService"]["readAsset"];
}
async function setup(
  deps: DecksPluginDeps = {},
  deck: DeckEntity = sampleDeck,
): Promise<CarouselFixture> {
  const harness = createPluginHarness<DecksPlugin>();
  await harness.installPlugin(new DecksPlugin(deps));
  const service = harness.getEntityService();
  await service.createEntity({ entity: deck });
  const pages: CapturedPage[] = [];
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected file operation");
  };
  service.fileAssets = {
    inspect: unexpected,
    publish: unexpected,
    fingerprint: unexpected,
    withAssetFile: unexpected,
    download: unexpected,
    close: async (): Promise<void> => undefined,
    withProducedFile: async (
      directory,
      use,
      options,
    ): ReturnType<typeof use> => {
      pages.push({
        directory,
        html: await readFile(join(directory, "index.html"), "utf8"),
        css: await readFile(join(directory, "styles/main.css"), "utf8"),
      });
      expect(
        JSON.parse(await readFile(join(directory, "render.json"), "utf8")),
      ).toEqual({ format: "pdf" });
      return use(
        {
          sourceFile: join(directory, "rendered.pdf"),
          sizeBytes: 8,
          sha256: "a".repeat(64),
        },
        options?.signal ?? new AbortController().signal,
      );
    },
  };
  const produce = spyOn(service.fileAssets, "withProducedFile");
  const buffered = spyOn(service, "readAsset").mockImplementation(unexpected);
  const context = harness.getEntityContext("test");
  return { context, service, pages, produce, buffered };
}

describe("Deck carousel attachment provider", () => {
  it("registers a file-only provider with the carousel filename and document metadata", async () => {
    const { context, produce, buffered, pages } = await setup();
    expect(context.attachments.hasProvider("deck", "carousel")).toBe(true);
    expect(await context.attachments.withFile(request, accept)).toEqual({
      type: "document",
      mimeType: "application/pdf",
      filename: "test-deck-carousel.pdf",
      source: { sourceFile: expect.any(String), sizeBytes: 8 },
      sha256: "a".repeat(64),
    });
    expect(produce).toHaveBeenCalledTimes(1);
    expect(buffered).not.toHaveBeenCalled();
    expect(pages[0]?.html).toContain("Slide 1");
    expect(pages[0]?.html).toContain("Slide 2");
    assert.ok(pages[0]);
    expect(
      await Bun.file(join(pages[0].directory, "index.html")).exists(),
    ).toBe(false);
    await assert.rejects(
      context.attachments.resolve(request),
      /does not support buffered resolution/,
    );
  });
  it("accepts twenty slides but refuses twenty-one before theme or producer acquisition", async () => {
    for (const count of [20, 21]) {
      const getThemeMode = mock(async (): Promise<"dark"> => "dark");
      const deck = {
        ...sampleDeck,
        content: `---\ntitle: Test Deck\nstatus: draft\nslug: test-deck\n---\n${Array.from({ length: count }, (_, index) => `# Slide ${index + 1}`).join("\n\n---\n\n")}`,
      };
      const { context, produce } = await setup({ getThemeMode }, deck);
      if (count === 21) {
        await assert.rejects(
          context.attachments.withFile(request, accept),
          /21 slides; maxSlides=20/,
        );
        expect(getThemeMode).not.toHaveBeenCalled();
        expect(produce).not.toHaveBeenCalled();
      } else {
        expect(
          await context.attachments.withFile(request, accept),
        ).toBeDefined();
        expect(produce).toHaveBeenCalledTimes(1);
      }
    }
  });
  it("preserves theme CSS, brand wordmark and the direct provider's dark default", async () => {
    const { context, service, pages } = await setup();
    const provider = new DeckCarouselAttachmentProvider({
      entityService: service,
      identity: context.identity,
      themeCSS: ":root{--carousel-test-token:#123456}",
      domain: "yeehaa.io",
    });
    await provider.withFile(request, accept);
    expect(provider.metadata).toEqual({ outputEntityType: "document" });
    expect(pages[0]?.css).toContain("--carousel-test-token");
    expect(pages[0]?.html).toContain('data-theme="dark"');
    expect(pages[0]?.html).toContain('aria-label="yeehaa.io"');
    expect(pages[0]?.html).toContain('<span class="wm-primary">yeehaa</span>');
    expect(pages[0]?.html).toContain('<span class="wm-secondary">io</span>');
  });
  it("reads current site-info theme per registered request rather than capturing it at registration", async () => {
    const { context, service, pages } = await setup();
    const info = {
      id: "site-info",
      entityType: "site-info",
      visibility: "public" as const,
      contentHash: "site-info-hash",
      content:
        "---\ntitle: Test Site\ndescription: Test\nthemeMode: light\n---",
      created: sampleDeck.created,
      updated: sampleDeck.updated,
      metadata: {},
    };
    await service.createEntity({ entity: info });
    await context.attachments.withFile(request, accept);
    await service.updateEntity({
      entity: { ...info, content: info.content.replace("light", "dark") },
    });
    await context.attachments.withFile(request, accept);
    expect(pages[0]?.html).toContain('data-theme="light"');
    expect(pages[1]?.html).toContain('data-theme="dark"');
  });
  it("forwards an injected live theme resolver", async () => {
    const getThemeMode = mock(async (): Promise<"light"> => "light");
    const { context, pages } = await setup({ getThemeMode });
    await context.attachments.withFile(request, accept);
    expect(getThemeMode).toHaveBeenCalledTimes(1);
    expect(pages[0]?.html).toContain('data-theme="light"');
  });
  it("joins theme acquisition on cancellation without starting a producer", async () => {
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<"light">();
    const { context, produce } = await setup({
      getThemeMode: async () => {
        entered.resolve();
        return release.promise;
      },
    });
    const caller = new AbortController();
    const primary = new Error("cancelled during theme lookup");
    let settled = false;
    const rejected = assert.rejects(
      context.attachments
        .withFile(request, accept, { signal: caller.signal })
        .finally(() => {
          settled = true;
        }),
      (error: unknown) => error === primary,
    );
    try {
      await entered.promise;
      caller.abort(primary);
      expect(settled).toBe(false);
    } finally {
      release.resolve("light");
      await rejected;
    }
    expect(produce).not.toHaveBeenCalled();
  });
  it("preserves theme failure without entering the consumer", async () => {
    const primary = new Error("theme unavailable");
    const { context, produce } = await setup({
      getThemeMode: async (): Promise<never> => {
        throw primary;
      },
    });
    const use = mock(accept);
    await assert.rejects(
      context.attachments.withFile(request, use),
      (error: unknown) => error === primary,
    );
    expect(use).not.toHaveBeenCalled();
    expect(produce).not.toHaveBeenCalled();
  });
  it("rejects pre-aborted requests and omits mismatched requests without theme acquisition", async () => {
    const getThemeMode = mock(async (): Promise<"dark"> => "dark");
    const { context, service, produce } = await setup();
    const provider = new DeckCarouselAttachmentProvider(
      { ...context, entityService: service },
      { getThemeMode },
    );
    expect(
      await provider.withFile({ ...request, attachmentType: "other" }, accept),
    ).toBeUndefined();
    expect(
      await provider.withFile(
        { ...request, sourceEntityType: "other" },
        accept,
      ),
    ).toBeUndefined();
    const primary = new Error("pre-aborted");
    await assert.rejects(
      provider.withFile(request, accept, {
        signal: AbortSignal.abort(primary),
      }),
      (error: unknown) => error === primary,
    );
    expect(getThemeMode).not.toHaveBeenCalled();
    expect(produce).not.toHaveBeenCalled();
  });
});
