import { createHash } from "node:crypto";
import { defineJobContract, type PublishMediaData } from "@brains/contracts";
import {
  countPdfPages,
  createDocumentEntity,
  createPdfDataUrl,
  documentMetadataSchema,
  type DocumentMetadata,
} from "@brains/document";
import { renderPdf as defaultRenderPdf } from "@brains/media-renderer";
import type { PdfRenderOptions } from "@brains/media-renderer";
import type {
  EntityDefinition,
  EntityJobDeclaration,
  EntityJobHandleContext,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
  type EntityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { parseMarkdown } from "@brains/utils/markdown";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

type DocumentDefinition = EntityDefinition<
  "document",
  typeof documentMetadataSchema
>;
type DocumentEntities = EntityJobHandleContext<unknown>["entities"];

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGE_COUNT = 20;
const DEFAULT_TIMEOUT_MS = 60_000;
const DOCUMENT_ID_MAX_LENGTH = 80;
const DOCUMENT_ID_HASH_LENGTH = 10;

const documentGenerationJobSchemaShape: {
  renderUrl: z.ZodOptional<z.ZodURL>;
  sourceEntityType: z.ZodString;
  sourceEntityId: z.ZodString;
  attachmentType: z.ZodString;
  documentId: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  filename: z.ZodOptional<z.ZodString>;
  dedupKey: z.ZodOptional<z.ZodString>;
  replace: z.ZodOptional<z.ZodBoolean>;
  pageCount: z.ZodOptional<z.ZodNumber>;
  maxPageCount: z.ZodOptional<z.ZodNumber>;
  maxBytes: z.ZodOptional<z.ZodNumber>;
  timeoutMs: z.ZodOptional<z.ZodNumber>;
  width: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
  height: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
  format: z.ZodOptional<z.ZodString>;
  targetEntityType: z.ZodOptional<z.ZodString>;
  targetEntityId: z.ZodOptional<z.ZodString>;
} = {
  renderUrl: z.url().optional(),
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  attachmentType: z.string().min(1),
  documentId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  dedupKey: z.string().min(1).optional(),
  replace: z.boolean().optional(),
  pageCount: z.number().int().min(0).optional(),
  maxPageCount: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  format: z.string().optional(),
  targetEntityType: z.string().min(1).optional(),
  targetEntityId: z.string().min(1).optional(),
};

export const documentGenerationJobSchemaBase: z.ZodObject<
  typeof documentGenerationJobSchemaShape
> = z.object(documentGenerationJobSchemaShape);

export type DocumentGenerationJobDataBase = z.output<
  typeof documentGenerationJobSchemaBase
>;

export const documentGenerationJobSchema: z.ZodType<DocumentGenerationJobDataBase> =
  documentGenerationJobSchemaBase.refine(
    (data) =>
      (data.targetEntityType === undefined &&
        data.targetEntityId === undefined) ||
      (data.targetEntityType !== undefined &&
        data.targetEntityId !== undefined),
    {
      message: "targetEntityType and targetEntityId must be provided together",
      path: ["targetEntityId"],
    },
  );

export type DocumentGenerationJobData = z.output<
  typeof documentGenerationJobSchema
>;

export interface DocumentGenerationResult {
  success: true;
  documentId: string;
  reused: boolean;
}

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export interface DocumentGenerationHandlerDeps {
  renderPdf?: RenderPdf;
}

/** Document's own job: a PDF rendered or resolved and stored as a document. */
export const documentGenerationJobContract: ReturnType<
  typeof defineJobContract<typeof documentGenerationJobSchema>
> = defineJobContract({
  type: "document:generate",
  input: documentGenerationJobSchema,
});

interface StoredDocument {
  readonly id: string;
  readonly metadata: DocumentMetadata;
}

/**
 * The dedup key for a generation job.
 *
 * - An explicitly-provided `dedupKey` always wins (callers/tests that pin a
 *   stable identity).
 * - The `renderUrl` (preview) path keys on the URL.
 * - The attachment-derived path keys on the source entity's identity AND its
 *   current content hash, so editing the source re-renders rather than
 *   reusing a stale document. If the source entity (or its hash) can't be
 *   found, we fall back to the identity-only key.
 *
 * The key intentionally covers only the source content; theme-mode and brand
 * are out of scope and are not expected to change at runtime.
 */
async function getDedupKey(
  runtime: EntityRuntime,
  data: DocumentGenerationJobData,
): Promise<string> {
  if (data.dedupKey !== undefined) {
    return data.dedupKey;
  }
  if (data.renderUrl !== undefined) {
    return `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl}`;
  }
  const base = `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:resolved-attachment`;
  const source = await runtime.anyEntities.getEntity({
    entityType: data.sourceEntityType,
    id: data.sourceEntityId,
  });
  return source ? `${base}:${source.contentHash}` : base;
}

/**
 * A document already made from the same source, read public as the
 * document plugin read it: a pending or failed one is not reused.
 */
async function findDocumentByDedupKey(
  runtime: EntityRuntime,
  dedupKey: string,
  preferredDocumentId?: string,
): Promise<StoredDocument | undefined> {
  const documents = (
    await runtime.anyEntities.listEntities({
      entityType: "document",
      options: { filter: { metadata: { dedupKey } } },
    })
  ).map((document) => ({
    id: document.id,
    metadata: documentMetadataSchema.parse(document.metadata),
  }));
  if (documents.length > 1) {
    runtime.logger.warn("Multiple documents share dedupKey; using first", {
      dedupKey,
      count: documents.length,
      ids: documents.map((d) => d.id),
      preferredDocumentId,
    });
  }
  const reusableDocuments = documents.filter(
    (document) =>
      document.metadata.status !== "pending" &&
      document.metadata.status !== "failed",
  );
  return (
    reusableDocuments.find((document) => document.id === preferredDocumentId) ??
    reusableDocuments[0]
  );
}

async function resolveDocumentAttachment(
  runtime: EntityRuntime,
  renderPdf: RenderPdf,
  data: DocumentGenerationJobData,
  documentId: string,
  limits: { timeoutMs: number; maxBytes: number },
): Promise<PublishMediaData> {
  if (data.renderUrl !== undefined) {
    return {
      type: "document",
      data: await renderPdf(data.renderUrl, {
        timeoutMs: limits.timeoutMs,
        maxBytes: limits.maxBytes,
        printBackground: true,
        preferCSSPageSize: true,
        ...(data.width !== undefined && { width: data.width }),
        ...(data.height !== undefined && { height: data.height }),
        ...(data.format !== undefined && { format: data.format }),
      }),
      mimeType: "application/pdf",
      filename: data.filename ?? `${documentId}.pdf`,
    };
  }

  const attachment = await runtime.attachments.resolve({
    sourceEntityType: data.sourceEntityType,
    sourceEntityId: data.sourceEntityId,
    attachmentType: data.attachmentType,
  });
  if (!attachment) {
    throw new Error(
      `No attachment provider found for ${data.sourceEntityType}/${data.attachmentType}`,
    );
  }
  if (attachment.type !== "document") {
    throw new Error(
      `Attachment provider returned ${attachment.type}; expected document`,
    );
  }
  return attachment;
}

/**
 * Add the document to the target's `documents`. A replacement drops the
 * target's references to other documents made from the same source
 * attachment, each read public as the document plugin read them; one that
 * cannot be read stays.
 */
async function attachDocumentToTarget(
  runtime: EntityRuntime,
  entityType: string,
  entityId: string,
  documentId: string,
  data: DocumentGenerationJobData,
): Promise<void> {
  const target = await runtime.anyEntities.getEntity({
    entityType,
    id: entityId,
  });
  if (!target) {
    throw new Error(`Target entity not found: ${entityType}/${entityId}`);
  }
  const { frontmatter } = parseMarkdown(target.content);
  const listed: unknown =
    frontmatter["documents"] ?? target.metadata["documents"];
  const existingDocuments = Array.isArray(listed)
    ? listed.filter(isDocumentReference)
    : [];
  const replaces = data.replace
    ? await supersededReferences(runtime, existingDocuments, documentId, data)
    : [];
  await runtime.linkInto(documentId, {
    entityType,
    entityId,
    list: "documents",
    ...(replaces.length > 0 && { replaces }),
  });
}

async function supersededReferences(
  runtime: EntityRuntime,
  references: Array<{ id: string }>,
  documentId: string,
  data: DocumentGenerationJobData,
): Promise<string[]> {
  const read = await Promise.all(
    references
      .filter((reference) => reference.id !== documentId)
      .map(async (reference) => ({
        id: reference.id,
        document: await runtime.anyEntities.getEntity({
          entityType: "document",
          id: reference.id,
        }),
      })),
  );
  return read.flatMap(({ id, document }) =>
    document &&
    isSameSourceAttachment(
      documentMetadataSchema.parse(document.metadata),
      data,
    )
      ? [id]
      : [],
  );
}

/** Save the rendered document over its pending placeholder, or as a new one. */
async function saveProcessedDocument(
  entities: DocumentEntities,
  document: DocumentDefinition,
  id: string,
  made: { readonly content: string; readonly metadata: DocumentMetadata },
): Promise<void> {
  const existing = await entities.get(document, id);
  if (existing) {
    await entities.update(document, existing, {
      content: made.content,
      metadata: made.metadata,
    });
    return;
  }
  await entities.create(document, { id, ...made });
}

/** Mark a pending document failed, keeping it to be seen and retried. */
async function failPendingDocument(
  entities: DocumentEntities,
  document: DocumentDefinition,
  id: string,
  error: string,
): Promise<void> {
  const existing = await entities.get(document, id);
  if (!existing) return;
  await entities.update(document, existing, {
    metadata: {
      ...existing.metadata,
      status: "failed",
      processingError: error,
    },
  });
}

/**
 * `document:generate`: a PDF rendered from a URL or resolved from a source
 * attachment, stored as a document, reused when one with the same source
 * exists, and added to the target's documents.
 */
export function generateDocumentJob(
  document: () => DocumentDefinition,
  deps: DocumentGenerationHandlerDeps = {},
): EntityJobDeclaration<typeof documentGenerationJobSchema> {
  const renderPdf = deps.renderPdf ?? defaultRenderPdf;
  return contractJob(documentGenerationJobContract, {
    handle: async (context): Promise<DocumentGenerationResult> => {
      const data: DocumentGenerationJobData = context.input;
      const { entities, progress } = context;
      const runtime = entityRuntime(context);
      runtime.logger.debug("Starting document generation job", {
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
      });

      const maxPageCount = data.maxPageCount ?? DEFAULT_MAX_PAGE_COUNT;
      const maxBytes = data.maxBytes ?? DEFAULT_MAX_BYTES;
      const timeoutMs = data.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      if (data.pageCount !== undefined && data.pageCount > maxPageCount) {
        throw new Error(
          `Refusing to render ${data.pageCount} page PDF; maxPageCount=${maxPageCount}`,
        );
      }

      const dedupKey = await getDedupKey(runtime, data);
      const documentId = getDocumentId(data, dedupKey);
      const hasRequestedDocumentIdentity =
        data.documentId !== undefined || data.filename !== undefined;
      if (data.replace !== true) {
        const existing = await findDocumentByDedupKey(
          runtime,
          dedupKey,
          hasRequestedDocumentIdentity ? documentId : undefined,
        );
        if (
          existing &&
          (!hasRequestedDocumentIdentity || existing.id === documentId)
        ) {
          if (data.targetEntityType && data.targetEntityId) {
            await attachDocumentToTarget(
              runtime,
              data.targetEntityType,
              data.targetEntityId,
              existing.id,
              data,
            );
          }
          await progress.report({
            progress: 100,
            message: "Reusing existing generated document",
          });
          return { success: true, documentId: existing.id, reused: true };
        }
      }

      await progress.report({
        progress: 20,
        message: "Rendering PDF document",
      });

      try {
        const attachment = await resolveDocumentAttachment(
          runtime,
          renderPdf,
          data,
          documentId,
          { timeoutMs, maxBytes },
        );
        const pdf = attachment.data;
        if (pdf.byteLength > maxBytes) {
          throw new Error(
            `Rendered PDF exceeds maxBytes=${maxBytes}: ${pdf.byteLength} bytes`,
          );
        }

        const measuredPageCount = countPdfPages(pdf);
        if (measuredPageCount > maxPageCount) {
          throw new Error(
            `Rendered PDF has ${measuredPageCount} pages, exceeding maxPageCount=${maxPageCount}`,
          );
        }
        const pageCount =
          measuredPageCount > 0 ? measuredPageCount : data.pageCount;

        await progress.report({
          progress: 70,
          message: "Storing PDF document",
        });

        const filename =
          data.filename ??
          (data.renderUrl === undefined
            ? attachment.filename
            : `${documentId}.pdf`);
        const entityData = createDocumentEntity({
          dataUrl: createPdfDataUrl(pdf),
          filename,
          ...(data.title && { title: data.title }),
          ...(pageCount !== undefined && { pageCount }),
          status: "draft",
          sourceEntityType: data.sourceEntityType,
          sourceEntityId: data.sourceEntityId,
          attachmentType: data.attachmentType,
          dedupKey,
        });
        await saveProcessedDocument(
          entities,
          document(),
          documentId,
          entityData,
        );

        if (data.targetEntityType && data.targetEntityId) {
          await attachDocumentToTarget(
            runtime,
            data.targetEntityType,
            data.targetEntityId,
            documentId,
            data,
          );
        }

        await progress.report({
          progress: 100,
          message: "PDF document generation complete",
        });

        return { success: true, documentId, reused: false };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        runtime.logger.error("Document generation failed", {
          error: errorMessage,
        });
        await failPendingDocument(
          entities,
          document(),
          documentId,
          errorMessage,
        );
        throw error;
      }
    },
  });
}

export function getDocumentId(
  data: DocumentGenerationJobData,
  dedupKey?: string,
): string {
  // Fall back to the dedup key (not the jobId) so a generation that reuses an
  // existing document resolves to the same id the caller computed up front —
  // otherwise the attachment URL would point at an id that was never created.
  //
  // Enqueue-side callers (the system_generate create interceptor
  // tool) can't await the content-hashed dedup key, so they omit it; they
  // always supply an explicit documentId/filename, falling through to the
  // identity-only key only as a last resort. The job handler passes the real
  // content-hashed dedup key so a reuse resolves to the same id.
  const identityKey = `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl ?? "resolved-attachment"}`;
  const base =
    data.documentId ??
    data.filename?.replace(/\.pdf$/i, "") ??
    dedupKey ??
    identityKey;
  const idBase =
    data.replace === true && data.documentId === undefined
      ? `${base}-${Date.now()}`
      : base;
  return normalizeDocumentId(idBase);
}

function normalizeDocumentId(base: string): string {
  const slug =
    slugify(base.replace(/[/:]+/g, " ")) || `document-${shortHash(base)}`;
  if (slug.length <= DOCUMENT_ID_MAX_LENGTH) return slug;

  const suffix = `-${shortHash(base)}`;
  const prefix = slug
    .slice(0, DOCUMENT_ID_MAX_LENGTH - suffix.length)
    .replace(/-+$/g, "");
  return `${prefix}${suffix}`;
}

function shortHash(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, DOCUMENT_ID_HASH_LENGTH);
}

function isDocumentReference(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function isSameSourceAttachment(
  metadata: DocumentMetadata,
  data: DocumentGenerationJobData,
): boolean {
  return (
    metadata.sourceEntityType === data.sourceEntityType &&
    metadata.sourceEntityId === data.sourceEntityId &&
    metadata.attachmentType === data.attachmentType
  );
}
