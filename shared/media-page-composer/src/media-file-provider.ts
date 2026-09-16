import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetRefSchema } from "@brains/assets";
import { imageFormatSchema } from "@brains/image";
import {
  attachmentFileSchema,
  type FileAttachmentProvider,
  type AttachmentFileConsumer,
  type AttachmentFileOptions,
  type AttachmentResolveRequest,
  type BaseEntity,
} from "@brains/plugins";
import type {
  MediaAttachmentContext,
  MediaAttachmentProviderConfig,
  MediaContentHelpers,
} from "./attachment-provider";
import { RENDER_REQUEST_FILE, type RenderRequest } from "./render-request";
import { renderMediaTemplateHtml } from "./media-template-renderer";

/** Controllers assemble textual template metadata only. Asset downloads and
 * rendering use owned actors; no data URL or buffer-to-file fallback exists.
 */
export function createMediaFileProvider<TEntity extends BaseEntity, TContent>(
  config: MediaAttachmentProviderConfig<TEntity, TContent>,
  context: MediaAttachmentContext,
  brandLabel: () => string | undefined,
  format: RenderRequest["format"],
): FileAttachmentProvider {
  return {
    metadata:
      format === "image"
        ? { outputEntityType: "image", targetField: "ogImageId" }
        : { outputEntityType: "document" },
    withFile: async <T>(
      request: AttachmentResolveRequest,
      use: AttachmentFileConsumer<T>,
      options?: AttachmentFileOptions,
    ): Promise<T | undefined> => {
      options?.signal?.throwIfAborted();
      if (
        request.sourceEntityType !== config.sourceEntityType ||
        request.attachmentType !== config.attachmentType
      )
        return undefined;
      const entity = await context.entityService.getEntity(
        { entityType: config.sourceEntityType, id: request.sourceEntityId },
        config.entitySchema,
      );
      options?.signal?.throwIfAborted();
      if (!entity) return undefined;
      const files = context.entityService.fileAssets;
      if (!files?.withProducedFile)
        throw new Error("Media file rendering is not provisioned");
      const root = await mkdtemp(join(tmpdir(), "brain-media-file-"));
      await mkdir(join(root, "assets"));
      await mkdir(join(root, "styles"));
      const transfers = new Map<string, Promise<string | undefined>>();
      let open = true;
      const requestOptions = options?.signal
        ? { signal: options.signal }
        : undefined;
      const helpers: MediaContentHelpers = {
        brandLabel: brandLabel(),
        resolveImageUrl: (id): Promise<string | undefined> => {
          if (!open) throw new Error("Media image reference scope is closed");
          options?.signal?.throwIfAborted();
          if (!id) return Promise.resolve(undefined);
          const existing = transfers.get(id);
          if (existing) return existing;
          // Bound retained reference metadata, alongside the existing 16-operation
          // runtime and two-actor admission. Repeated references share one transfer.
          if (transfers.size >= 16)
            throw new Error("Media image reference capacity exceeded");
          const index = transfers.size;
          const work = (async (): Promise<string | undefined> => {
            const image = await context.entityService.getEntity({
              entityType: "image",
              id,
            });
            options?.signal?.throwIfAborted();
            if (!image?.content) return undefined;
            const ref = assetRefSchema.safeParse(image.content.trim());
            if (!ref.success) return undefined;
            const format = imageFormatSchema.parse(image.metadata["format"]);
            const relative = `assets/image-${index}.${format}`;
            await files.download(
              { ref: ref.data, outputFile: join(root, relative) },
              requestOptions,
            );
            options?.signal?.throwIfAborted();
            return `/${relative}`;
          })();
          transfers.set(id, work);
          void work.catch(() => undefined); // Joined below even if a builder abandons its promise.
          return work;
        },
      };
      const errors: unknown[] = [];
      let built: { content: TContent } | undefined;
      try {
        built = { content: await config.buildContent(entity, helpers) };
      } catch (error) {
        errors.push(error);
      } finally {
        open = false;
      }
      const outcomes = await Promise.allSettled(transfers.values());
      for (const outcome of outcomes)
        if (
          outcome.status === "rejected" &&
          !errors.some((error) => Object.is(error, outcome.reason))
        )
          errors.push(outcome.reason);
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          "Media content and referenced image downloads failed",
          { cause: errors[0] },
        );
      if (!built) throw new Error("Media content has no acknowledged outcome");
      options?.signal?.throwIfAborted();
      const themeMode =
        typeof config.themeMode === "function"
          ? await config.themeMode()
          : (config.themeMode ?? "light");
      options?.signal?.throwIfAborted();
      const filename =
        config.filename?.(entity) ??
        `${config.slug(entity)}${format === "image" ? "-og.png" : "-printable.pdf"}`;
      const html = renderMediaTemplateHtml({
        template: config.template,
        format,
        content: built.content,
        siteConfig: {
          title: config.pageTitle(built.content),
          themeMode,
        },
        imageBuildService: null,
      });
      await writeFile(
        join(root, RENDER_REQUEST_FILE),
        JSON.stringify({ format }),
        "utf8",
      );
      await writeFile(join(root, "index.html"), html, "utf8");
      await writeFile(join(root, "styles/main.css"), context.themeCSS, "utf8");
      const result = await files.withProducedFile(
        root,
        (file, signal) =>
          use(
            attachmentFileSchema.parse({
              ...(format === "image"
                ? {
                    type: "image",
                    mimeType: "image/png",
                    filename,
                  }
                : {
                    type: "document",
                    mimeType: "application/pdf",
                    filename,
                  }),
              sha256: file.sha256,
              source: {
                sourceFile: file.sourceFile,
                sizeBytes: file.sizeBytes,
              },
            }),
            signal,
          ),
        requestOptions,
      );
      // No post-publication abort check. Retain input staging on any failure;
      // successful cleanup follows all producer and consumer acknowledgements.
      await rm(root, { recursive: true });
      return result;
    },
  };
}
