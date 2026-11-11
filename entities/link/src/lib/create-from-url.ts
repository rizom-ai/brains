import type {
  EntityCreateAllocation,
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRoute,
  EntityDefinition,
} from "@brains/sdk/entities";
import {
  entityRuntime,
  type EntityCreateCaller,
} from "@brains/sdk/internal/entity-runtime";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { slugify } from "@brains/utils/string-utils";
import { linkCaptureJobContract, linkSource } from "../jobs/capture";
import {
  linkFrontmatterSchema,
  type LinkMetadata,
  type linkMetadataSchema,
} from "../schemas/link";
import { UrlUtils } from "./url-utils";

type LinkDefinition = EntityDefinition<"link", typeof linkMetadataSchema>;

type EntityCreateRouteResolution =
  | EntityCreateResolution<typeof linkMetadataSchema>
  | EntityCreateAllocation<typeof linkMetadataSchema>;

const NO_URL_IN_CONTENT =
  "Direct link creation requires full link markdown/frontmatter, or provide a URL to capture.";
const NO_URL_IN_PROMPT =
  "Link creation requires a URL in the prompt, content, or title, or full link markdown content for direct creation.";

/** The first URL a request names: its URL, else in its content, prompt or title. */
function requestedUrl(context: EntityCreateContext): string | undefined {
  const { input } = context;
  if (input.url) return input.url;
  return [input.content, input.prompt, input.title]
    .flatMap((value) => (value ? UrlUtils.extractUrls(value) : []))
    .at(0);
}

/** What the capture job is told about where the request came from. */
function captureMetadata(caller: EntityCreateCaller): Record<string, string> {
  return {
    interfaceId: caller.interfaceType,
    ...(caller.userId !== undefined && { userId: caller.userId }),
    ...(caller.channelId !== undefined && { channelId: caller.channelId }),
    ...(caller.channelName !== undefined && {
      channelName: caller.channelName,
    }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * A link captured from the URL a request names, as the link plugin class's
 * interceptor captured it: a pending link written under the URL's id (a
 * link that already has it is reused, and one at another visibility than
 * asked is refused), and the capture queued for it as the caller's data
 * processing, in their channel.
 */
function captureRequested(
  context: EntityCreateContext,
  url: string,
): { readonly refuse: string } {
  const runtime = entityRuntime(context);
  const { input } = context;
  const caller = runtime.caller;
  const now = new Date().toISOString();
  const title = input.title?.trim()
    ? input.title.trim()
    : new URL(url).hostname;
  return runtime.queued({
    entityId: UrlUtils.generateEntityId(url),
    placeholder: {
      content: `Pending link capture for ${url}.`,
      metadata: {
        status: "pending",
        title,
        url,
        description: "Link capture is in progress.",
        capturedAt: now,
        source: linkSource({
          interfaceId: caller.interfaceType,
          ...(caller.channelId !== undefined && {
            channelId: caller.channelId,
          }),
          ...(caller.channelName !== undefined && {
            channelName: caller.channelName,
          }),
        }),
      },
      ...(input.visibility !== undefined && { visibility: input.visibility }),
    },
    job: {
      contract: linkCaptureJobContract,
      data: { url, metadata: captureMetadata(caller) },
      attributed: { operationType: "data_processing", channel: true },
    },
  });
}

/**
 * A link from a prompt or a URL alone: the URL it names is captured. A
 * prompt that names none is refused, as the link plugin class refused it.
 */
function linkRoute(
  refusal: string,
): EntityCreateRoute<typeof linkMetadataSchema> {
  return {
    resolve: async (context): Promise<EntityCreateRouteResolution> => {
      const url = requestedUrl(context);
      return url ? captureRequested(context, url) : { refuse: refusal };
    },
  };
}

/** A full link document: its frontmatter a link's, decoded. */
function linkDocument(
  content: string,
): { readonly id: string; readonly metadata: LinkMetadata } | undefined {
  // Dates read as the store reads them: an unquoted timestamp is a string.
  const parsed = parseMarkdownWithFrontmatter(
    content,
    z.record(z.string(), z.unknown()),
  );
  const decoded = linkFrontmatterSchema.safeParse(parsed.metadata);
  if (!decoded.success) return undefined;
  const [url] = UrlUtils.extractUrls(content);
  if (!url) return undefined;
  const id =
    slugify(url) || slugify(decoded.data.title) || `link-${Date.now()}`;
  return { id, metadata: decoded.data };
}

/**
 * A link from content: a full link document is saved as written under its
 * URL's slug, as the link plugin class meant its direct save to (its own
 * test saved one, on a store that did not check the metadata; on the
 * brain's store the class's metadata lacked `capturedAt`, and every such
 * save fell back to a capture). A document whose id is taken, or text that
 * is not a link document, is captured from the URL it names; text that
 * names none is refused.
 */
export function linkFromContent(
  link: () => LinkDefinition,
): EntityCreateRoute<typeof linkMetadataSchema> {
  return {
    resolve: async (context): Promise<EntityCreateRouteResolution> => {
      const content = context.input.content ?? "";
      const document = linkDocument(content);
      if (
        document &&
        !(await entityRuntime(context).packageEntities.get(link(), document.id))
      ) {
        return {
          create: { id: document.id, content, metadata: document.metadata },
        };
      }
      const url = requestedUrl(context);
      return url
        ? captureRequested(context, url)
        : { refuse: NO_URL_IN_CONTENT };
    },
  };
}

export const linkFromPrompt: EntityCreateRoute<typeof linkMetadataSchema> =
  linkRoute(NO_URL_IN_PROMPT);

/** A URL alone, as system_create hands on a URL source. */
export const linkFromUrl: EntityCreateRoute<typeof linkMetadataSchema> =
  linkRoute(NO_URL_IN_PROMPT);
