import type { ServicePluginContext } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  withPublishFiles,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { BaseEntity } from "@brains/plugins";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import type { PublishableMetadata } from "../schemas/publishable";

type PublishableEntity = BaseEntity<PublishableMetadata>;
const publishDocumentReferenceSchema = z.object({ id: z.string().min(1) });
type PublishDocumentReference = z.output<typeof publishDocumentReferenceSchema>;
interface ParsedPublishContent {
  bodyContent: string;
  coverImageId?: string;
  documents?: PublishDocumentReference[];
  sourceEntityType?: string;
  sourceEntityId?: string;
}
export interface PreparedPublishContent {
  bodyContent: string;
  imageData?: PublishImageData;
  documentData?: PublishMediaData[];
}

/** All native loans encompass provider publication AND durable acknowledgement.
 * Acquisition is serial and capped below the existing sixteen-operation budget.
 */
export async function withPublishContent<T>(
  context: ServicePluginContext,
  entity: PublishableEntity,
  use: (content: PreparedPublishContent) => Promise<T>,
): Promise<T> {
  const parsed = parsePublishContent(entity.content);
  return withPublishFiles(
    {
      entityService: context.entityService,
      withAttachmentFile: context.attachments.withFile,
      missingDocuments: "source",
    },
    parsed,
    (files) => use({ bodyContent: parsed.bodyContent, ...files }),
  );
}

function parsePublishContent(content: string): ParsedPublishContent {
  // Malformed YAML cannot supply usable references. Publish that body verbatim;
  // faults after parsing must not silently drop requested images/documents.
  let parsed;
  try {
    parsed = parseMarkdownWithFrontmatter(
      content,
      z.record(z.string(), z.unknown()),
    );
  } catch {
    return { bodyContent: content };
  }
  const coverImageId = parseStringField(parsed.metadata["coverImageId"]);
  const documents = parseDocumentReferences(parsed.metadata["documents"]);
  const sourceEntityType = parseStringField(
    parsed.metadata["sourceEntityType"],
  );
  const sourceEntityId = parseStringField(parsed.metadata["sourceEntityId"]);
  return {
    bodyContent: parsed.content,
    ...(coverImageId && { coverImageId }),
    ...(documents.length > 0 && { documents }),
    ...(sourceEntityType && { sourceEntityType }),
    ...(sourceEntityId && { sourceEntityId }),
  };
}
function parseDocumentReferences(value: unknown): PublishDocumentReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const result = publishDocumentReferenceSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}
function parseStringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
