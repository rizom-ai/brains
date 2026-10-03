import type { EntityTypeConfig } from "@brains/plugins";
import type { RawEntity } from "../types";
import type { ImageJobQueueDeps } from "./image-job-queue";
import {
  queueCoverImageConversionIfNeeded,
  queueInlineImageConversionIfNeeded,
} from "./image-job-queue";

export function queueImportImageConversions(
  imageJobQueue: ImageJobQueueDeps,
  rawEntity: RawEntity,
  filePath: string,
  typeConfig: Pick<EntityTypeConfig, "binaryStorage">,
): void {
  // Binary content holds no markdown; scanning a large data URL for image
  // syntax would block the event loop for seconds.
  if (typeConfig.binaryStorage) return;
  queueCoverImageConversionIfNeeded(imageJobQueue, rawEntity.content, filePath);
  queueInlineImageConversionIfNeeded(
    imageJobQueue,
    rawEntity.content,
    filePath,
    rawEntity.id,
  );
}
