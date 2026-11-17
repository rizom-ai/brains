import {
  createPendingDocumentEntity,
  DOCUMENT_ASSET_MAX_BYTES,
  isPdfBytes,
  type documentMetadataSchema,
} from "@brains/document";
import type {
  EntityCreateContext,
  EntityCreateRouting,
  EntityCreateAttachment,
} from "@brains/sdk/entities";
import {
  entityRuntime,
  uploadTitle,
} from "@brains/sdk/internal/entity-runtime";
import { slugify } from "@brains/utils/string-utils";
import {
  documentGenerationJobContract,
  documentGenerationJobSchema,
  getDocumentId,
  type DocumentGenerationJobData,
} from "./jobs/generate-document";

type CreateResultAttachment = ReturnType<EntityCreateAttachment>;

interface Resolution {
  readonly refuse: string;
}

function buildUploadedDocumentAttachment(input: {
  entityId: string;
  filename: string;
}): CreateResultAttachment {
  const encodedId = encodeURIComponent(input.entityId);
  return {
    mediaType: "application/pdf",
    url: `/api/chat/attachments/document?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/document?id=${encodedId}&download=1`,
    filename: input.filename,
    source: {
      entityType: "document",
      entityId: input.entityId,
      attachmentType: "uploaded",
    },
  };
}

/** The dedup key a create computes before queueing, as the job will. */
async function getDedupKey(
  context: EntityCreateContext,
  data: DocumentGenerationJobData,
): Promise<string> {
  if (data.dedupKey !== undefined) return data.dedupKey;
  if (data.renderUrl !== undefined) {
    return `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl}`;
  }

  const base = `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:resolved-attachment`;
  const source = await entityRuntime(context).anyEntities.getEntity({
    entityType: data.sourceEntityType,
    id: data.sourceEntityId,
  });
  return source ? `${base}:${source.contentHash}` : base;
}

/** A document already made from the same source, read public. */
async function findExistingDocument(
  context: EntityCreateContext,
  dedupKey: string,
): Promise<{ readonly id: string } | undefined> {
  const [found] = await entityRuntime(context).anyEntities.listEntities({
    entityType: "document",
    options: { filter: { metadata: { dedupKey } } },
  });
  return found;
}

/**
 * Another entity's attachment, such as a carousel, rendered to a PDF by the
 * `document:generate` job; a document already made from the same source is
 * reused rather than written again.
 */
async function routeAttachment(
  context: EntityCreateContext,
): Promise<Resolution> {
  const { input } = context;
  const from =
    input.from?.kind === "entity-attachment" ? input.from : undefined;
  if (!from) return { refuse: "Unsupported attachment source" };

  const generationData = documentGenerationJobSchema.parse({
    sourceEntityType: from.sourceEntityType,
    sourceEntityId: from.sourceEntityId,
    attachmentType: from.attachmentType,
    ...(input.title && { title: input.title }),
    ...(input.replace === true && { replace: true }),
    ...(input.targetEntityType && {
      targetEntityType: input.targetEntityType,
    }),
    ...(input.targetEntityId && { targetEntityId: input.targetEntityId }),
  });
  const dedupKey = await getDedupKey(context, generationData);
  const existing =
    generationData.replace === true
      ? undefined
      : await findExistingDocument(context, dedupKey);
  const documentId = existing?.id ?? getDocumentId(generationData, dedupKey);
  const filename = `${documentId}.pdf`;
  // No payload until the job fills it: a pending document claims no bytes.
  const pending = createPendingDocumentEntity({
    filename,
    title: generationData.title ?? documentId,
    status: "pending",
    sourceEntityType: generationData.sourceEntityType,
    sourceEntityId: generationData.sourceEntityId,
    attachmentType: generationData.attachmentType,
    dedupKey,
  });
  return entityRuntime(context).queued({
    entityId: documentId,
    ...(!existing && {
      placeholder: { content: pending.content, metadata: pending.metadata },
    }),
    job: {
      contract: documentGenerationJobContract,
      data: { ...generationData, dedupKey, documentId },
      attributed: true,
    },
    attachment: {
      mediaType: "application/pdf",
      url: `/api/chat/attachments/document?id=${encodeURIComponent(documentId)}`,
      downloadUrl: `/api/chat/attachments/document?id=${encodeURIComponent(documentId)}&download=1`,
      filename,
      source: {
        entityType: "document",
        entityId: documentId,
        attachmentType: generationData.attachmentType,
      },
    },
  });
}

/** An uploaded PDF kept as a document, under the next free id. */
async function routeUpload(context: EntityCreateContext): Promise<Resolution> {
  const { input } = context;
  const uploadRef = input.from?.kind === "upload" ? input.from : undefined;
  if (!uploadRef) return { refuse: "Unsupported upload ref kind" };

  let upload;
  try {
    upload = await context.uploads.read(uploadRef.id);
  } catch {
    // An unreadable reference is one this create cannot keep.
    return { refuse: "Upload ref not found" };
  }

  if (upload.record.mediaType !== "application/pdf") {
    return { refuse: "Only PDF uploads can be promoted to document entities" };
  }

  const title = uploadTitle({
    title: input.title,
    filename: upload.record.filename,
  });
  const id = slugify(title);
  if (!id) {
    return {
      refuse:
        "Could not derive a document id from the uploaded filename. Provide a title.",
    };
  }

  if (!isPdfBytes(upload.content)) {
    return { refuse: "The uploaded file is not a PDF" };
  }

  const filename = upload.record.filename;
  // The bytes are staged by the runtime and published with the record.
  return entityRuntime(context).stored({
    record: {
      id,
      metadata: {
        mimeType: "application/pdf",
        sizeBytes: upload.content.byteLength,
        filename,
        title,
        status: "draft",
        sourceUploadId: uploadRef.id,
        sourceFilename: filename,
        sourceMediaType: upload.record.mediaType,
        attachmentType: "uploaded",
        dedupKey: `upload:${uploadRef.kind}:${uploadRef.id}`,
      },
    },
    bytes: upload.content,
    maxBytes: DOCUMENT_ASSET_MAX_BYTES,
    attachment: ({ entityId }) =>
      buildUploadedDocumentAttachment({ entityId, filename }),
  });
}

/**
 * Document's create routes, as the document plugin's interceptor took
 * requests: an uploaded PDF is kept, also claimed from the upload endpoint,
 * and an attachment is rendered. Any other request goes on to the ordinary
 * create.
 */
export const documentCreateRouting: EntityCreateRouting<
  typeof documentMetadataSchema
> = {
  fromUpload: { mediaTypes: ["application/pdf"], resolve: routeUpload },
  fromAttachment: { resolve: routeAttachment },
};
