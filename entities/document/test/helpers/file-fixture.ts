import { mock, expect } from "bun:test";
import { prepareAsset } from "@brains/assets";
import {
  countPdfPages,
  documentAdapter,
  type DocumentAssetFacts,
} from "@brains/document";
import type {
  AttachmentFile,
  BaseEntity,
  ServicePluginContext,
} from "@brains/plugins";
import type { DocumentGenerationHandlerDeps } from "../../src/handlers/documentGenerationHandler";

export const fixturePdf: Uint8Array = new TextEncoder().encode(
  "%PDF-1.7\n% fixture\n%%EOF\n",
);
export interface DocumentFileFixture {
  state: {
    held: number;
    renders: number;
    pdf: Uint8Array;
    renderError?: Error;
    publicationError?: Error;
    publicationCommitted?: boolean;
    cleanupError?: Error;
  };
  preview: NonNullable<DocumentGenerationHandlerDeps["withPreviewPdfFile"]>;
  attachment(bytes?: Uint8Array): AttachmentFile;
  registerSource(path: string, bytes: Uint8Array): void;
  seed(
    id: string,
    metadata?: Record<string, unknown>,
    bytes?: Uint8Array,
  ): Promise<void>;
}
/** Explicit unit collaborators: byte arrays seed a fake asset repository, never
 * a production buffer-to-file path. Native rendering/inspection/publication are
 * exercised separately through the canonical actor/transaction fixture.
 */
export function installDocumentFileFixture(
  context: Pick<ServicePluginContext, "entityService">,
): DocumentFileFixture {
  const state: DocumentFileFixture["state"] = {
    held: 0,
    renders: 0,
    pdf: fixturePdf,
  };
  const sources = new Map<string, Uint8Array>();
  const attachment = (bytes = state.pdf): AttachmentFile => {
    const asset = prepareAsset(bytes);
    const sourceFile = `/fixture/document-${sources.size}.pdf`;
    sources.set(sourceFile, bytes);
    return {
      type: "document",
      mimeType: "application/pdf",
      filename: "source.pdf",
      source: { sourceFile, sizeBytes: bytes.length },
      sha256: asset.digest,
    };
  };
  const facts = (bytes: Uint8Array): DocumentAssetFacts => {
    const asset = prepareAsset(bytes);
    return {
      ref: asset.ref,
      digest: asset.digest,
      sizeBytes: asset.sizeBytes,
      mimeType: "application/pdf",
      pageCount: countPdfPages(bytes),
    };
  };
  const unexpected = (): never => {
    throw new Error("Unexpected buffered/transport operation");
  };
  context.entityService.fileAssets = {
    inspect: mock(async (source, options) => {
      expect(options?.inspector).toBe("pdf");
      options?.signal?.throwIfAborted();
      const bytes = sources.get(source.sourceFile);
      if (!bytes) throw new Error("Missing fixture source");
      const inspected = facts(bytes);
      return {
        sizeBytes: inspected.sizeBytes,
        sha256: inspected.digest,
        details: {
          mimeType: inspected.mimeType,
          pageCount: inspected.pageCount,
        },
      };
    }),
    publish: mock(async (input, options) => {
      options?.signal?.throwIfAborted();
      if (state.publicationError && !state.publicationCommitted)
        throw state.publicationError;
      const bytes = sources.get(input.sourceFile);
      if (!bytes) throw new Error("Missing fixture publication source");
      const preparedAsset = prepareAsset(bytes);
      expect(input.publication.request.entity.content).toBe(preparedAsset.ref);
      const publication = input.publication;
      const result =
        publication.operation === "createEntity"
          ? await context.entityService.createEntity({
              ...publication.request,
              preparedAsset,
            })
          : publication.operation === "updateEntity"
            ? await context.entityService.updateEntity({
                ...publication.request,
                preparedAsset,
              })
            : await context.entityService.upsertEntity({
                ...publication.request,
                preparedAsset,
              });
      if (state.publicationError) throw state.publicationError;
      return result;
    }),
    withAssetFile: unexpected,
    fingerprint: unexpected,
    download: unexpected,
    putHttp: unexpected,
    postHttp: unexpected,
    close: async (): Promise<void> => undefined,
  };
  const preview: DocumentFileFixture["preview"] = async (
    _input,
    _files,
    use,
    options,
  ) => {
    state.renders++;
    if (state.renderError) throw state.renderError;
    const file = attachment();
    state.held++;
    try {
      const result = await use(
        { ...file.source, sha256: file.sha256 },
        options?.signal ?? new AbortController().signal,
      );
      if (state.cleanupError) throw state.cleanupError;
      return result;
    } finally {
      state.held--;
    }
  };
  return {
    state,
    preview,
    attachment,
    registerSource: (path, bytes): void => {
      sources.set(path, bytes);
    },
    seed: async (id, metadata = {}, bytes = state.pdf): Promise<void> => {
      const data = documentAdapter.createDocumentEntity({
        facts: facts(bytes),
        filename: `${id}.pdf`,
      });
      await context.entityService.createEntity<BaseEntity>({
        entity: { id, ...data, metadata: { ...data.metadata, ...metadata } },
        preparedAsset: prepareAsset(bytes),
      });
    },
  };
}
