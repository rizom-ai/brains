import {
  defineEntity,
  slugify,
  z,
  type EntityCreateAllocation,
  type EntityCreateContext,
  type EntityCreateResolution,
  type EntityDefinition,
  type EntityGenerationJobDeclaration,
  type EntityGenerationResult,
  sourceAttachmentKey,
} from "@brains/sdk/entities";
import {
  countPdfPages,
  createPdfDataUrl,
  documentMetadataSchema,
  parseDocumentDataUrl,
  type DocumentEntity,
} from "@brains/document";
import { documentLink } from "./lib/document-attachment";
import { documentIdFor } from "./lib/document-identity";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGE_COUNT = 20;

const PENDING_PDF_DATA_URL = createPdfDataUrl(
  Buffer.from("%PDF-1.4\n% Pending document placeholder\n%%EOF\n"),
);

const DOCUMENT_INSTRUCTIONS =
  "Document entities store durable file artifacts such as PDFs. Uploaded " +
  "PDFs are raw document files, not decks. Source-derived document artifacts " +
  "are durable documents backed by registered attachment providers such as " +
  "carousel or printable. Generate saved PDF artifacts through " +
  "system_generate with source.kind attachment; preserve raw uploaded PDFs " +
  "with system_create source.kind upload and transform preserve.";

/**
 * What a render is told: which entity to fill in, which attachment to ask
 * for, and what to leave the source pointing at.
 *
 * The dedup decision is not here — it belongs to the create route, which is
 * what already knows whether it allocated a document or found one. `reuse`
 * is that answer travelling to the job, so a second request for an unchanged
 * deck never asks the provider to render it again.
 */
const renderInput = z.object({
  entityId: z.string().min(1),
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  attachmentType: z.string().min(1),
  dedupKey: z.string().min(1),
  title: z.string().min(1).optional(),
  reuse: z.boolean().optional(),
  maxBytes: z.number().int().positive().optional(),
  maxPageCount: z.number().int().positive().optional(),
  linkInto: z
    .object({
      entityType: z.string().min(1),
      entityId: z.string().min(1),
      // A post may hold several rendered PDFs, so this is a list rather
      // than a field — and naming it here is what keeps the runtime from
      // knowing the word "documents".
      list: z.literal("documents"),
      replaces: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

const render: EntityGenerationJobDeclaration<typeof renderInput> = {
  input: renderInput,
  generate: async ({
    input,
    entities,
    attachments,
    progress,
  }): Promise<EntityGenerationResult> => {
    const linkInto = input.linkInto ? { linkInto: input.linkInto } : {};

    if (input.reuse === true) {
      // The route found a document for this exact source content. Handing it
      // back unchanged is what makes the write a no-op, and skips the render
      // the provider would otherwise do.
      const existing = await entities.getEntity<DocumentEntity>({
        entityType: "document",
        id: input.entityId,
      });
      if (!existing) {
        return {
          success: false,
          error: `Document "${input.entityId}" was reused but no longer exists`,
        };
      }
      await progress.report({
        progress: 100,
        message: "Reusing the document already rendered from this source",
      });
      return {
        success: true,
        id: existing.id,
        content: existing.content,
        metadata: existing.metadata,
        ...linkInto,
      };
    }

    await progress.report({ progress: 20, message: "Rendering PDF document" });

    const attachment = await attachments.resolve({
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      attachmentType: input.attachmentType,
    });
    if (!attachment) {
      return {
        success: false,
        error: `No attachment provider found for ${input.sourceEntityType}/${input.attachmentType}`,
      };
    }
    if (attachment.type !== "document") {
      return {
        success: false,
        error: `Attachment provider returned ${attachment.type}; expected document`,
      };
    }

    const pdf = attachment.data;
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
    if (pdf.byteLength > maxBytes) {
      return {
        success: false,
        error: `Rendered PDF exceeds maxBytes=${maxBytes}: ${pdf.byteLength} bytes`,
      };
    }
    const maxPageCount = input.maxPageCount ?? DEFAULT_MAX_PAGE_COUNT;
    const pageCount = countPdfPages(pdf);
    if (pageCount > maxPageCount) {
      return {
        success: false,
        error: `Rendered PDF has ${pageCount} pages, exceeding maxPageCount=${maxPageCount}`,
      };
    }

    await progress.report({ progress: 70, message: "Storing PDF document" });

    return {
      success: true,
      id: input.entityId,
      content: createPdfDataUrl(pdf),
      metadata: {
        mimeType: "application/pdf",
        // The provider names what it produced; the placeholder's filename
        // was a guess made before it existed.
        filename: attachment.filename,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(pageCount > 0 ? { pageCount } : {}),
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        attachmentType: input.attachmentType,
        dedupKey: input.dedupKey,
      },
      ...linkInto,
    };
  },
};

/**
 * Which of the target's existing document references this render supersedes.
 *
 * Only the document package can answer: it means "references to documents
 * derived from the same source and attachment as this one", which is a fact
 * about document metadata. A reference to something else is left alone.
 */
async function supersededReferences(
  context: EntityCreateContext,
  target: { entityType: string; id: string },
  source: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  },
): Promise<string[]> {
  const entity = await context.entities.getEntity({
    entityType: target.entityType,
    id: target.id,
  });
  if (!entity) return [];

  const references = documentReferences(entity.content);
  const superseded = await Promise.all(
    references.map(async (id) => {
      const document = await context.entities.getEntity<DocumentEntity>({
        entityType: "document",
        id,
      });
      return document !== null &&
        document.metadata.sourceEntityType === source.sourceEntityType &&
        document.metadata.sourceEntityId === source.sourceEntityId &&
        document.metadata.attachmentType === source.attachmentType
        ? id
        : undefined;
    }),
  );
  return superseded.filter((id): id is string => id !== undefined);
}

function documentReferences(content: string): string[] {
  // Read straight out of the frontmatter block the runtime writes back, so
  // this and the write agree on the shape without sharing a parser.
  const block = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  if (block === undefined) return [];
  return [...block.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].flatMap((match) =>
    match[1] !== undefined ? [match[1]] : [],
  );
}

async function routeFromAttachment(
  context: EntityCreateContext,
): Promise<EntityCreateResolution | EntityCreateAllocation> {
  const from = context.input.from;
  if (from?.kind !== "entity-attachment") {
    return { refuse: "Documents are derived from an entity's attachment" };
  }

  const source = {
    sourceEntityType: from.sourceEntityType,
    sourceEntityId: from.sourceEntityId,
    attachmentType: from.attachmentType,
  };
  const sourceEntity = await context.entities.getEntity({
    entityType: source.sourceEntityType,
    id: source.sourceEntityId,
  });
  const dedupKey = sourceAttachmentKey({
    ...source,
    ...(sourceEntity ? { sourceContentHash: sourceEntity.contentHash } : {}),
  });

  const replace = context.input.replace === true;
  const existing = replace
    ? undefined
    : await findReusableDocument(context, dedupKey);

  const target =
    context.input.targetEntityType !== undefined &&
    context.input.targetEntityId !== undefined
      ? {
          entityType: context.input.targetEntityType,
          id: context.input.targetEntityId,
        }
      : undefined;
  const replaces =
    target && replace
      ? await supersededReferences(context, target, source)
      : [];
  const linkInto = target
    ? {
        linkInto: {
          entityType: target.entityType,
          entityId: target.id,
          list: "documents" as const,
          ...(replaces.length > 0 ? { replaces } : {}),
        },
      }
    : {};

  if (existing) {
    return {
      existing: { id: existing.id },
      delegate: {
        job: "render",
        input: { ...source, dedupKey, reuse: true, ...linkInto },
      },
      attachment: ({ entityId }) =>
        documentLink({
          entityId,
          filename: `${entityId}.pdf`,
          attachmentType: source.attachmentType,
        }),
    };
  }

  const id = documentIdFor({
    dedupKey,
    replace,
    replacementSuffix: String(Date.now()),
  });
  const title = context.input.title ?? id;
  const filename = `${id}.pdf`;
  return {
    create: {
      id,
      content: PENDING_PDF_DATA_URL,
      metadata: {
        title,
        mimeType: "application/pdf",
        filename,
        status: "pending",
        ...source,
        dedupKey,
      },
    },
    delegate: {
      job: "render",
      input: {
        ...source,
        dedupKey,
        ...(context.input.title !== undefined
          ? { title: context.input.title }
          : {}),
        ...linkInto,
      },
    },
    attachment: ({ entityId }) =>
      documentLink({
        entityId,
        filename: `${entityId}.pdf`,
        attachmentType: source.attachmentType,
      }),
  };
}

async function findReusableDocument(
  context: EntityCreateContext,
  dedupKey: string,
): Promise<DocumentEntity | undefined> {
  const documents = await context.entities.listEntities<DocumentEntity>({
    entityType: "document",
    options: { filter: { metadata: { dedupKey } } },
  });
  if (documents.length > 1) {
    context.logger.warn("Multiple documents share dedupKey; using first", {
      dedupKey,
      ids: documents.map((document) => document.id),
    });
  }
  // A document still being written, or one that failed, is not something to
  // hand back as though it were the artifact.
  return documents.find(
    (document) =>
      document.metadata.status !== "pending" &&
      document.metadata.status !== "failed",
  );
}

async function routeFromUpload(
  context: EntityCreateContext,
): Promise<EntityCreateResolution> {
  const from = context.input.from;
  if (from?.kind !== "upload") return { refuse: "Upload ref not found" };

  const upload = await context.uploads.read(from.id).catch(() => null);
  if (!upload) return { refuse: "Upload ref not found" };
  if (upload.record.mediaType !== "application/pdf") {
    return {
      refuse: "Only PDF uploads can be preserved as document entities",
    };
  }

  const title = uploadTitle(context.input.title, upload.record.filename);
  const id = slugify(title);
  if (!id) {
    return {
      refuse:
        "Could not derive a document id from the uploaded filename. Provide a title.",
    };
  }

  return {
    create: {
      id,
      content: createPdfDataUrl(upload.content),
      metadata: {
        title,
        mimeType: "application/pdf",
        filename: upload.record.filename,
        sourceUploadId: from.id,
        sourceFilename: upload.record.filename,
        sourceMediaType: upload.record.mediaType,
        attachmentType: "uploaded",
        dedupKey: `upload:${from.kind}:${from.id}`,
      },
    },
    attachment: ({ entityId }) =>
      documentLink({
        entityId,
        filename: upload.record.filename,
        attachmentType: "uploaded",
      }),
  };
}

function uploadTitle(requested: string | undefined, filename: string): string {
  const title = requested?.trim();
  if (title) return title;
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || filename;
}

/**
 * A durable file artifact: a PDF the brain keeps, whether it rendered it from
 * another entity or was handed it.
 *
 * The content is the file itself as a data URL, so the codec has nothing to
 * encode — filename and media type live beside the file rather than in it,
 * which is why decoding one recovers only half of its metadata.
 */
export const document: EntityDefinition<
  "document",
  typeof documentMetadataSchema
> = defineEntity({
  type: "document",
  purpose:
    "A durable rendered file artifact such as a printable or carousel PDF.",
  metadata: documentMetadataSchema,
  config: {
    embeddable: false,
    projectionSource: false,
    projectionSourceRole: "excluded",
  },
  markdown: {
    decode: ({ content }) => {
      // Throws on anything that is not a PDF data URL, which is the whole of
      // what the file can say about itself.
      parseDocumentDataUrl(content);
      return { content, metadata: {} };
    },
    encode: ({ content }) => ({ content, frontmatter: {} }),
  },
  jobs: { render },
  create: {
    // An uploaded PDF is preserved as it arrived; a source-derived one is
    // rendered by whichever provider owns that attachment.
    fromUpload: { mediaTypes: ["application/pdf"], resolve: routeFromUpload },
    fromAttachment: { resolve: routeFromAttachment },
  },
  instructions: DOCUMENT_INSTRUCTIONS,
});
