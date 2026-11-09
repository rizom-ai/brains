import {
  JobResult,
  PROGRESS_STEPS,
  defineJobContract,
} from "@brains/contracts";
import type {
  EntityDefinition,
  EntityJobDeclaration,
  EntityJobHandleContext,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import { UrlFetcher } from "../lib/url-fetcher";
import { UrlUtils } from "../lib/url-utils";
import {
  linkStatusSchema,
  type LinkMetadata,
  type LinkSource,
  type linkMetadataSchema,
} from "../schemas/link";
import { linkExtractionSchema } from "../templates/extraction-template";

type LinkDefinition = EntityDefinition<"link", typeof linkMetadataSchema>;

const linkCaptureMetadataSchema: z.ZodObject<{
  interfaceId: z.ZodOptional<z.ZodString>;
  userId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  timestamp: z.ZodOptional<z.ZodString>;
}> = z.object({
  interfaceId: z.string().optional(),
  userId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  timestamp: z.string().optional(),
});

export type LinkCaptureMetadata = z.output<typeof linkCaptureMetadataSchema>;

/** A capture: the URL, and where the request for it came from. */
export const linkCaptureJobSchema: z.ZodObject<{
  url: z.ZodURL;
  metadata: z.ZodOptional<typeof linkCaptureMetadataSchema>;
}> = z.object({
  url: z.url(),
  metadata: linkCaptureMetadataSchema.optional(),
});

export type LinkCaptureJobData = z.output<typeof linkCaptureJobSchema>;

/** What a capture answers. */
export const linkCaptureResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  entityId: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  url: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<typeof linkStatusSchema>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  status: linkStatusSchema.optional(),
  error: z.string().optional(),
});

export type LinkCaptureResult = z.output<typeof linkCaptureResultSchema>;

/** The capture a create from a URL queues. */
export const linkCaptureJobContract: ReturnType<
  typeof defineJobContract<typeof linkCaptureJobSchema>
> = defineJobContract({ type: "link:capture", input: linkCaptureJobSchema });

/**
 * The link plugin class ran the same capture under its generation job
 * name; jobs queued under it still run.
 */
export const linkGenerationJobContract: ReturnType<
  typeof defineJobContract<typeof linkCaptureJobSchema>
> = defineJobContract({
  type: "link:generation",
  input: linkCaptureJobSchema,
});

/** Where a capture came from: the channel, else the interface. */
export function linkSource(
  metadata: LinkCaptureMetadata | undefined,
): LinkSource {
  const channelId = metadata?.channelId;
  if (channelId) {
    return {
      ref: `matrix:${channelId}`,
      label: metadata.channelName ?? channelId,
    };
  }
  const interfaceId = metadata?.interfaceId ?? "cli";
  return { ref: `${interfaceId}:local`, label: interfaceId.toUpperCase() };
}

/** Fetch a page through Jina Reader, with the package's key when it has one. */
export function linkFetcher(jinaApiKey: string | undefined): UrlFetcher {
  return new UrlFetcher(jinaApiKey ? { jinaApiKey } : undefined);
}

/**
 * Write the link, over the record that has its id or as a new one, as the
 * link plugin class saved a processed link.
 */
async function saveLink(
  link: LinkDefinition,
  context: EntityJobHandleContext<LinkCaptureJobData>,
  entityId: string,
  record: { readonly content: string; readonly metadata: LinkMetadata },
): Promise<void> {
  const existing = await context.entities.get(link, entityId);
  if (existing) {
    await context.entities.update(link, existing, record);
  } else {
    await context.entities.create(link, { id: entityId, ...record });
  }
}

async function capture(
  link: LinkDefinition,
  context: EntityJobHandleContext<LinkCaptureJobData>,
  fetcher: UrlFetcher,
): Promise<LinkCaptureResult> {
  const { input, progress } = context;
  const { url, metadata } = input;
  const runtime = entityRuntime(context);
  await progress.report({
    progress: PROGRESS_STEPS.START,
    total: 100,
    message: "Starting link capture",
  });
  const entityId = UrlUtils.generateEntityId(url);

  await progress.report({
    progress: PROGRESS_STEPS.INIT,
    total: 100,
    message: "Checking for existing link",
  });
  const existing = await context.entities.get(link, entityId);
  if (existing && existing.metadata.status !== "pending") {
    runtime.logger.info("Link already captured, returning existing", {
      url,
      entityId,
    });
    return {
      success: true,
      entityId: existing.id,
      title: existing.metadata.title,
      url,
      status: existing.metadata.status,
    };
  }
  if (existing) {
    runtime.logger.info("Pending link exists, completing extraction", {
      url,
      entityId,
    });
  }

  const source = linkSource(metadata);
  const capturedAt = new Date().toISOString();

  await progress.report({
    progress: PROGRESS_STEPS.FETCH,
    total: 100,
    message: "Fetching webpage content",
  });
  const fetched = await fetcher.fetch(url);
  if (
    !fetched.success &&
    (fetched.errorType === "url_not_found" ||
      fetched.errorType === "url_unreachable")
  ) {
    runtime.logger.warn("Link URL not accessible", {
      url,
      errorType: fetched.errorType,
      error: fetched.error,
    });
    const title = new URL(url).hostname;
    const error = `Could not capture link: ${fetched.error}`;
    await saveLink(link, context, entityId, {
      content: error,
      metadata: {
        status: "pending",
        title,
        url,
        description: error,
        capturedAt,
        source,
      },
    });
    return {
      success: false,
      entityId,
      title,
      url,
      status: "pending",
      error,
    };
  }

  await progress.report({
    progress: PROGRESS_STEPS.PROCESS,
    total: 100,
    message: "Extracting content with AI",
  });
  const extraction = await runtime.generate(
    {
      template: "extraction",
      prompt: fetched.success
        ? `Extract structured information from this webpage content:\n\n${fetched.content}`
        : `The URL ${url} could not be fetched. Return success: false with error: "${fetched.error}"`,
      data: { url, hasContent: fetched.success },
      representedIdentity: "none",
    },
    linkExtractionSchema,
  );
  runtime.logger.debug("AI extraction result", { result: extraction });

  await progress.report({
    progress: PROGRESS_STEPS.EXTRACT,
    total: 100,
    message: "Processing extraction results",
  });

  // Incomplete extraction: kept pending, with what it found.
  if (
    !extraction.success ||
    !extraction.title ||
    !extraction.description ||
    !extraction.summary
  ) {
    const title = extraction.title || new URL(url).hostname;
    runtime.logger.info("Incomplete extraction, saving as pending", { url });
    await progress.report({
      progress: PROGRESS_STEPS.SAVE,
      total: 100,
      message: "Saving link as pending",
    });
    await saveLink(link, context, entityId, {
      content: extraction.summary,
      metadata: {
        status: "pending",
        title,
        url,
        description: extraction.description,
        capturedAt,
        source,
      },
    });
    await progress.report({
      progress: PROGRESS_STEPS.COMPLETE,
      total: 100,
      message: "Link saved (pending)",
    });
    return { success: true, entityId, title, url, status: "pending" };
  }

  await progress.report({
    progress: PROGRESS_STEPS.SAVE,
    total: 100,
    message: `Saving link: "${extraction.title}"`,
  });
  await saveLink(link, context, entityId, {
    content: extraction.summary,
    metadata: {
      status: "draft",
      title: extraction.title,
      url,
      description: extraction.description,
      capturedAt,
      source,
    },
  });
  await progress.report({
    progress: PROGRESS_STEPS.COMPLETE,
    total: 100,
    message: `Link captured: "${extraction.title}"`,
  });
  return {
    success: true,
    entityId,
    title: extraction.title,
    url,
    status: "draft",
  };
}

/**
 * The link's capture under one of the names it is queued by: the page
 * fetched, its title, description and summary extracted, and the link
 * saved as a draft, or kept pending with what was found when the page is
 * out of reach or the extraction is incomplete; a link already captured
 * is answered as it is. Written as the package, as the link plugin class
 * saved it.
 */
export function linkCaptureJob(
  link: () => LinkDefinition,
  contract: typeof linkCaptureJobContract,
  jinaApiKey: string | undefined,
): EntityJobDeclaration<typeof linkCaptureJobSchema> {
  const fetcher = linkFetcher(jinaApiKey);
  return contractJob(contract, {
    handle: async (context): Promise<LinkCaptureResult> => {
      try {
        return await capture(link(), context, fetcher);
      } catch (error) {
        entityRuntime(context).logger.error("Link capture job failed", {
          error,
          data: context.input,
        });
        return JobResult.failure(error);
      }
    },
  });
}
