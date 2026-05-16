import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import type { PublishableMetadata } from "../schemas/publishable";

type PublishableEntity = BaseEntity<PublishableMetadata>;

const publishDocumentReferenceSchema = z.object({
  id: z.string().min(1),
});

type PublishDocumentReference = z.infer<typeof publishDocumentReferenceSchema>;

interface ParsedPublishContent {
  bodyContent: string;
  coverImageId?: string;
  documents?: PublishDocumentReference[];
}

export interface PreparedPublishContent {
  bodyContent: string;
  imageData?: PublishImageData;
  documentData?: PublishMediaData[];
}

export async function preparePublishContent(
  context: ServicePluginContext,
  entity: PublishableEntity,
): Promise<PreparedPublishContent> {
  const { bodyContent, coverImageId, documents } = parsePublishContent(
    entity.content,
  );
  const imageData = coverImageId
    ? await fetchPublishImageData(context, coverImageId)
    : undefined;
  const documentData = documents
    ? await fetchPublishDocumentData(context, documents)
    : undefined;

  const prepared: PreparedPublishContent = { bodyContent };
  if (imageData) {
    prepared.imageData = imageData;
  }
  if (documentData && documentData.length > 0) {
    prepared.documentData = documentData;
  }
  return prepared;
}

function parsePublishContent(content: string): ParsedPublishContent {
  try {
    const parsed = parseMarkdownWithFrontmatter(content, z.record(z.unknown()));
    const rawCoverImageId = parsed.metadata["coverImageId"];
    const coverImageId =
      typeof rawCoverImageId === "string" ? rawCoverImageId : undefined;
    const documents = parseDocumentReferences(parsed.metadata["documents"]);

    return {
      bodyContent: parsed.content,
      ...(coverImageId && { coverImageId }),
      ...(documents.length > 0 && { documents }),
    };
  } catch {
    return { bodyContent: content };
  }
}

function parseDocumentReferences(value: unknown): PublishDocumentReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const result = publishDocumentReferenceSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

async function fetchPublishImageData(
  context: ServicePluginContext,
  coverImageId: string,
): Promise<PublishImageData | undefined> {
  const image = await context.entityService.getEntity<BaseEntity>({
    entityType: "image",
    id: coverImageId,
  });
  if (!image?.content) return undefined;

  const parsed = parseBase64DataUrl(image.content);
  if (!parsed || !parsed.mimeType.startsWith("image/")) return undefined;

  return {
    data: parsed.data,
    mimeType: parsed.mimeType,
  };
}

async function fetchPublishDocumentData(
  context: ServicePluginContext,
  documents: PublishDocumentReference[],
): Promise<PublishMediaData[]> {
  const results = await Promise.all(
    documents.map((item) => fetchPublishDocumentItem(context, item)),
  );
  return results.filter((item): item is PublishMediaData => item !== undefined);
}

async function fetchPublishDocumentItem(
  context: ServicePluginContext,
  reference: PublishDocumentReference,
): Promise<PublishMediaData | undefined> {
  const entity = await context.entityService.getEntity<BaseEntity>({
    entityType: "document",
    id: reference.id,
  });
  if (!entity?.content) return undefined;

  const parsed = parseBase64DataUrl(entity.content);
  if (!parsed || parsed.mimeType !== "application/pdf") return undefined;

  return {
    type: "document",
    data: parsed.data,
    mimeType: "application/pdf",
    filename: getFilename(entity, reference.id),
  };
}

function parseBase64DataUrl(
  content: string,
): { mimeType: string; data: Buffer } | undefined {
  const match = content.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) return undefined;
  return {
    mimeType: match[1],
    data: Buffer.from(match[2], "base64"),
  };
}

function getFilename(entity: BaseEntity, fallbackId: string): string {
  const filename = entity.metadata["filename"];
  return typeof filename === "string" && filename.length > 0
    ? filename
    : `${fallbackId}.pdf`;
}
