import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { JobRequest } from "../types";
import type { FrontmatterImageConverter } from "./frontmatter-image-converter";
import type { MarkdownImageConverter } from "./markdown-image-converter";
import { resolveInSyncPath } from "./path-utils";

export interface ImageJobQueueDeps {
  logger: Logger;
  syncPath: string;
  jobQueueCallback?: ((job: JobRequest) => Promise<string>) | undefined;
  coverImageConverter: FrontmatterImageConverter;
  inlineImageConverter: MarkdownImageConverter;
}

function queueJob(
  deps: ImageJobQueueDeps,
  job: JobRequest,
  filePath: string,
  label: string,
): void {
  if (!deps.jobQueueCallback) return;
  deps.jobQueueCallback(job).catch((error) => {
    deps.logger.warn(`Failed to queue ${label} job`, {
      filePath,
      error: getErrorMessage(error),
    });
  });
}

export function queueCoverImageConversionIfNeeded(
  deps: ImageJobQueueDeps,
  content: string,
  filePath: string,
): void {
  if (!deps.jobQueueCallback) return;

  const detection = deps.coverImageConverter.detectCoverImageUrl(content);
  if (!detection) return;

  queueJob(
    deps,
    {
      type: "cover-image-convert",
      data: {
        filePath: resolveInSyncPath(deps.syncPath, filePath),
        sourceUrl: detection.sourceUrl,
        postTitle: detection.postTitle,
        postSlug: detection.postSlug,
        customAlt: detection.customAlt,
      },
    },
    filePath,
    "cover image conversion",
  );

  deps.logger.debug("Queued cover image conversion job", {
    filePath,
    sourceUrl: detection.sourceUrl,
  });
}

export function queueInlineImageConversionIfNeeded(
  deps: ImageJobQueueDeps,
  content: string,
  filePath: string,
  postSlug: string,
): void {
  if (!deps.jobQueueCallback) return;

  const detections = deps.inlineImageConverter.detectInlineImages(
    content,
    postSlug,
  );
  if (detections.length === 0) return;

  queueJob(
    deps,
    {
      type: "inline-image-convert",
      data: {
        filePath: resolveInSyncPath(deps.syncPath, filePath),
        postSlug,
      },
    },
    filePath,
    "inline image conversion",
  );

  deps.logger.debug("Queued inline image conversion job", {
    filePath,
    imageCount: detections.length,
  });
}
