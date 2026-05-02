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
): void {
  queueCoverImageConversionIfNeeded(imageJobQueue, rawEntity.content, filePath);
  queueInlineImageConversionIfNeeded(
    imageJobQueue,
    rawEntity.content,
    filePath,
    rawEntity.id,
  );
}
