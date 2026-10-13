import { promises as fs } from "fs";
import { dirname, join } from "path";
import { SITE_CHANNELS, type SiteBuildStagingPayload } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { renderEpub } from "@brains/media-page-composer";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import {
  groupContinuations,
  listBookSections,
  parseBookData,
} from "../datasources/book-datasource";
import { bookSchema } from "../schemas/book";
import { bookHref, licenseLabel } from "../templates/book-design";

/** The registered book view an EPUB is rendered from. */
export const BOOK_EPUB_TEMPLATE = "book:epub";

/**
 * Every site build carries each public book with sections as an EPUB beside
 * its title page, rendered from the book view, so the file always matches the
 * pages built with it.
 */
export function subscribeToBookEpubStaging(
  context: EntityPluginContext,
  logger: Logger,
): void {
  context.messaging.subscribeExecution<
    SiteBuildStagingPayload,
    { success: boolean }
  >(SITE_CHANNELS.buildStaging, async (message) => {
    const payload = message.payload;
    try {
      await writeBookEpubs(context, payload.outputDir);
    } catch (error) {
      // A thrown error would be swallowed by the broadcast; reporting it fails
      // the build and keeps the previous generation, links and files intact.
      logger.error("Failed to write book EPUBs", error);
      payload.reportFailure(
        `Book EPUB generation failed: ${getErrorMessage(error)}`,
      );
    }
    return { success: true };
  });
}

async function writeBookEpubs(
  context: EntityPluginContext,
  outputDir: string,
): Promise<void> {
  const template = context.views.get(BOOK_EPUB_TEMPLATE);
  if (!template) throw new Error(`${BOOK_EPUB_TEMPLATE} is not registered`);
  const books = await context.entityService.listEntities(
    { entityType: "book", options: { limit: 1000 } },
    bookSchema,
  );
  for (const entity of books) {
    const book = parseBookData(entity);
    const sections = groupContinuations(
      await listBookSections(book.id, context.entityService),
      new Set(book.frontmatter.continuations),
    );
    if (sections.length === 0) continue;
    const epub = renderEpub({
      template,
      content: {
        title: book.metadata.title,
        author: book.frontmatter.author,
        colophon: {
          author: book.frontmatter.author,
          year: book.frontmatter.year,
          edition: book.frontmatter.edition,
          source: book.frontmatter.source,
          attribution: book.frontmatter.attribution,
          license: licenseLabel(book),
        },
        sections: sections.map(([first, ...rest]) => ({
          title: first.metadata.title,
          headings: first.frontmatter.headings,
          body: [first, ...rest].map((entry) => entry.body.trim()).join("\n\n"),
        })),
      },
      metadata: {
        identifier: `urn:brains:book:${book.id}`,
        title: book.metadata.title,
        creator: book.frontmatter.author ?? undefined,
        language: "de",
        modified: book.updated.replace(/\.\d+Z$/, "Z"),
        source: book.frontmatter.source,
        rights:
          [licenseLabel(book), book.frontmatter.attribution]
            .filter((part): part is string => part !== null)
            .join(" · ") || undefined,
      },
    });
    const file = join(outputDir, `${bookHref(book).slice(1)}.epub`);
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, epub);
  }
}
