import { describe, it, expect, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import { prepareAsset } from "@brains/assets";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type EntityAdapter,
  type MockShell,
  type ServicePluginContext,
} from "@brains/plugins/test";
import type { BaseEntity, AttachmentFile } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import type { PublishableMetadata } from "../../src/schemas/publishable";
import {
  withPublishContent,
  type PreparedPublishContent,
} from "../../src/tools/publish-content";

function createStubAdapter(entityType: string): EntityAdapter<BaseEntity> {
  return {
    entityType,
    purpose: "Test entity",
    schema: baseEntitySchema,
    toMarkdown: (entity) => entity.content,
    fromMarkdown: (content) => ({ content }),
    extractMetadata: (entity) => entity.metadata,
    parseFrontMatter: (_markdown, schema) => schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}
function post(content: string): BaseEntity<PublishableMetadata> {
  return {
    id: "post-1",
    entityType: "social-post",
    content,
    contentHash: "test",
    visibility: "public",
    created: "2026-05-30T00:00:00.000Z",
    updated: "2026-05-30T00:00:00.000Z",
    metadata: { status: "draft" },
  };
}
const unexpected = (): never => {
  throw new Error("Buffered or unrelated operation forbidden");
};
interface FixtureFile {
  file: AttachmentFile;
  ref: string;
}

describe("withPublishContent", () => {
  let context: ServicePluginContext;
  let shell: MockShell;
  let held: number;
  let files: Map<string, FixtureFile>;
  beforeEach(() => {
    held = 0;
    files = new Map();
    shell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(shell, "content-pipeline");
    for (const type of ["image", "document"])
      shell
        .getEntityRegistry()
        .registerEntityType(type, baseEntitySchema, createStubAdapter(type));
    context.entityService.readAsset = unexpected;
    context.entityService.fileAssets = {
      withAssetFile: async (ref, use, options): ReturnType<typeof use> => {
        const entry = [...files.values()].find(
          (candidate) => candidate.ref === ref,
        );
        assert.ok(entry);
        held++;
        try {
          return await use(
            { ...entry.file.source, sha256: entry.file.sha256 },
            options?.signal ?? new AbortController().signal,
          );
        } finally {
          held--;
        }
      },
      inspect: async (
        source,
        options,
      ): ReturnType<
        NonNullable<
          ServicePluginContext["entityService"]["fileAssets"]
        >["inspect"]
      > => {
        const entry = files.get(source.sourceFile);
        assert.ok(entry);
        if (entry.file.type === "document")
          expect(options?.inspector).toBe("pdf");
        return {
          sizeBytes: entry.file.source.sizeBytes,
          sha256: entry.file.sha256,
          details:
            entry.file.type === "document"
              ? { mimeType: "application/pdf", pageCount: 0 }
              : { mediaType: "image/png" },
        };
      },
      putHttp: unexpected,
      postHttp: unexpected,
      fingerprint: unexpected,
      publish: unexpected,
      download: unexpected,
      close: async (): Promise<void> => undefined,
    };
  });
  async function seed(
    kind: "image" | "document",
    id: string,
  ): Promise<AttachmentFile> {
    const asset = prepareAsset(
      new TextEncoder().encode(`fixture-${kind}-${id}`),
    );
    const source = { sourceFile: `/fixture/${id}`, sizeBytes: asset.sizeBytes };
    const file: AttachmentFile =
      kind === "document"
        ? {
            source,
            sha256: asset.digest,
            type: "document",
            mimeType: "application/pdf",
            filename: `${id}.pdf`,
          }
        : {
            source,
            sha256: asset.digest,
            type: "image",
            mimeType: "image/png",
            filename: `${id}.png`,
          };
    files.set(source.sourceFile, { file, ref: asset.ref });
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: kind,
        content: asset.ref,
        metadata: {
          status: "draft",
          sizeBytes: asset.sizeBytes,
          ...(kind === "document"
            ? {
                mimeType: "application/pdf",
                pageCount: 0,
                filename: file.filename,
              }
            : { mediaType: "image/png", width: 1, height: 1, format: "png" }),
        },
      },
      preparedAsset: asset,
    });
    return file;
  }
  function sourceProvider(file: AttachmentFile): void {
    context.attachments.register("deck", "carousel", {
      withFile: async (request, use, options): ReturnType<typeof use> => {
        expect(request.sourceEntityId).toBe("deck-1");
        held++;
        try {
          return await use(
            file,
            options?.signal ?? new AbortController().signal,
          );
        } finally {
          held--;
        }
      },
    });
  }
  function prepare(content: string): Promise<PreparedPublishContent> {
    // Metadata assertions only. Production publication must remain inside use.
    return withPublishContent(
      context,
      post(content),
      async (prepared) => prepared,
    );
  }
  it("joins the consumer and preserves its exact outcome or failure", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const outcome = { id: "published" };
    let settled = false;
    const work = withPublishContent(context, post("Body"), async (content) => {
      expect(content.bodyContent).toBe("Body");
      entered.resolve();
      await release.promise;
      return outcome;
    }).finally(() => {
      settled = true;
    });
    try {
      await entered.promise;
      expect(settled).toBe(false);
    } finally {
      release.resolve();
    }
    expect(await work).toBe(outcome);
    const primary = new Error("consumer failed");
    await assert.rejects(
      withPublishContent(context, post("Body"), async () => {
        throw primary;
      }),
      (error: unknown) => error === primary,
    );
  });
  it("strips valid frontmatter and publishes malformed YAML verbatim", async () => {
    expect(
      (await prepare("---\ntitle: Title\nstatus: draft\n---\n\nBody"))
        .bodyContent,
    ).toBe("Body");
    const malformed = "---\ninvalid: [\n---\nBody";
    expect((await prepare(malformed)).bodyContent).toBe(malformed);
  });
  it("holds image and document loans through publication acknowledgement", async () => {
    const image = await seed("image", "cover");
    const document = await seed("document", "report");
    const result = await withPublishContent(
      context,
      post("---\ncoverImageId: cover\ndocuments:\n  - id: report\n---\nBody"),
      async (content) => {
        expect(held).toBe(2);
        expect(content.imageData).toMatchObject({
          ...image.source,
          sha256: image.sha256,
          mimeType: "image/png",
        });
        expect(content.documentData?.[0]).toMatchObject({
          ...document.source,
          sha256: document.sha256,
          type: "document",
          filename: "report.pdf",
        });
        expect("data" in (content.imageData ?? {})).toBe(false);
        return "acknowledged";
      },
    );
    expect(result).toBe("acknowledged");
    expect(held).toBe(0);
  });
  for (const documents of [
    "",
    "documents: []\n",
    "documents:\n  - id: missing\n",
    "documents:\n  - wrong: ignored\n",
  ]) {
    it(`uses a scoped source attachment when explicit references yield nothing: ${documents.trim() || "absent"}`, async () => {
      const file = await seed("document", "source");
      sourceProvider(file);
      await withPublishContent(
        context,
        post(
          `---\n${documents}sourceEntityType: deck\nsourceEntityId: deck-1\n---\nBody`,
        ),
        async (content) => {
          expect(held).toBe(1);
          expect(content.documentData?.[0]?.sourceFile).toBe(
            file.source.sourceFile,
          );
        },
      );
      expect(held).toBe(0);
    });
  }
  it("prefers explicit documents over a registered source renderer", async () => {
    const file = await seed("document", "explicit");
    context.attachments.register("deck", "carousel", { withFile: unexpected });
    const content = await prepare(
      "---\ndocuments:\n  - id: explicit\nsourceEntityType: deck\nsourceEntityId: deck-1\n---\nBody",
    );
    expect(content.documentData?.[0]?.sha256).toBe(file.sha256);
    expect(held).toBe(0);
  });
  it("preserves consumer failure without retrying source resolution", async () => {
    sourceProvider(await seed("document", "source"));
    const failure = new Error("unknown send outcome");
    let calls = 0;
    await assert.rejects(
      withPublishContent(
        context,
        post("---\nsourceEntityType: deck\nsourceEntityId: deck-1\n---\nBody"),
        async () => {
          calls++;
          throw failure;
        },
      ),
      (error: unknown) => error === failure,
    );
    expect(calls).toBe(1);
    expect(held).toBe(0);
  });
  it("omits a missing cover but rejects unmigrated inline content", async () => {
    expect(
      (await prepare("---\ncoverImageId: missing\n---\nBody")).imageData,
    ).toBeUndefined();
    await context.entityService.createEntity({
      entity: {
        id: "inline",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERg==",
        metadata: { mimeType: "application/pdf", filename: "inline.pdf" },
      },
    });
    await assert.rejects(prepare("---\ndocuments:\n  - id: inline\n---\nBody"));
    expect(held).toBe(0);
  });
  it("bounds nested document acquisitions below operation admission capacity", async () => {
    await assert.rejects(
      prepare(
        `---\ndocuments:\n${Array.from({ length: 9 }, (_, index) => `  - id: doc-${index}`).join("\n")}\n---\nBody`,
      ),
    );
    expect(held).toBe(0);
  });
});
