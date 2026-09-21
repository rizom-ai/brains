import type { EntityServiceClient } from "@brains/entity-service";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { AttachmentFileResolver } from "./attachment-file";
import {
  withPublishEntityFile,
  publishAttachmentFile,
} from "./publish-file-scope";

export interface PublishFileReferences {
  coverImageId?: string | undefined;
  documents?: Array<{ id: string }> | undefined;
  sourceEntityType?: string | undefined;
  sourceEntityId?: string | undefined;
}
export interface ScopedPublishFiles {
  imageData?: PublishImageData;
  documentData?: PublishMediaData[];
}
export interface PublishFileScopeDependencies {
  entityService: Pick<
    EntityServiceClient,
    "getEntity" | "fileAssets" | "statAsset"
  >;
  withAttachmentFile?: AttachmentFileResolver | undefined;
  missingDocuments: "source" | "error";
}
/** Acquire serial loans below the existing sixteen-operation budget, and keep
 * every loan through external publication and its local durable acknowledgement.
 */
export async function withPublishFiles<T>(
  deps: PublishFileScopeDependencies,
  input: PublishFileReferences,
  use: (files: ScopedPublishFiles) => Promise<T>,
): Promise<T> {
  const references = z
    .array(z.object({ id: z.string().min(1) }))
    .max(8)
    .parse(input.documents ?? []);
  const withDocuments = (imageData?: PublishImageData): Promise<T> => {
    const prepared: ScopedPublishFiles = { ...(imageData && { imageData }) };
    const collected: PublishMediaData[] = [];
    const assertLive = (): void => {
      imageData?.signal.throwIfAborted();
      for (const file of collected) file.signal.throwIfAborted();
    };
    const visit = async (index: number): Promise<T> => {
      assertLive();
      const reference = references[index];
      if (!reference) {
        if (collected.length)
          return use({ ...prepared, documentData: collected });
        if (references.length && deps.missingDocuments === "error")
          throw new Error(
            `Refusing to publish: ${references.length} document(s) referenced but none could be fetched`,
          );
        if (
          !input.sourceEntityType ||
          !input.sourceEntityId ||
          !deps.withAttachmentFile
        )
          return use(prepared);
        const result = await deps.withAttachmentFile(
          {
            sourceEntityType: input.sourceEntityType,
            sourceEntityId: input.sourceEntityId,
            attachmentType: "carousel",
          },
          async (file, signal) => {
            const descriptor = await publishAttachmentFile(
              deps.entityService.fileAssets,
              file,
              signal,
            );
            assertLive();
            return {
              value: await use({ ...prepared, documentData: [descriptor] }),
            };
          },
          { ...(imageData && { signal: imageData.signal }) },
        );
        if (result !== undefined) return result.value;
        assertLive();
        return use(prepared);
      }
      const document = await deps.entityService.getEntity({
        entityType: "document",
        id: reference.id,
      });
      assertLive();
      // Missing/unready references may fall back to source resolution by caller
      // policy. Invalid ready content is never treated as an inline PDF.
      if (
        !document ||
        document.metadata["status"] === "pending" ||
        document.metadata["status"] === "failed"
      )
        return visit(index + 1);
      return withPublishEntityFile(
        deps.entityService,
        document,
        "document",
        async (file) => {
          const filename = z
            .string()
            .min(1)
            .parse(document.metadata["filename"]);
          collected.push({
            ...file,
            type: "document",
            mimeType: "application/pdf",
            filename,
          });
          return visit(index + 1);
        },
        { ...(imageData && { signal: imageData.signal }) },
      );
    };
    return visit(0);
  };
  if (!input.coverImageId) return withDocuments();
  const image = await deps.entityService.getEntity({
    entityType: "image",
    id: input.coverImageId,
  });
  if (!image) return withDocuments();
  return withPublishEntityFile(
    deps.entityService,
    image,
    "image",
    withDocuments,
  );
}
