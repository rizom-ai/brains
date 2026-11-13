import { homepageChatAvailable } from "@brains/site-atlas";
import {
  askBoxAvailabilityState,
  sharedStateNamespace,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";
import { book } from "./book-entity";
import { bookSection } from "./book-section-entity";
import { bookAskDataSource } from "./datasources/book-ask-datasource";
import { bookDataSource } from "./datasources/book-datasource";
import { bookThemeDataSource } from "./datasources/book-theme-datasource";
import { subscribeToBookEpubStaging } from "./lib/book-epub-staging";
import { getTemplates } from "./lib/register-templates";

const bookConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

const BOOK_INSTRUCTIONS = [
  'Books (entityType "book") hold an author\'s works; their text is in their sections (entityType "book-section"), whose `section` is their siglum.',
  'When a question concerns the author\'s ideas or texts, search the sections first: system_search with scope { kind: "type", entityType: "book-section" }.',
  "Ground every claim in sections you found, and cite each section by its siglum and its book's title.",
  "Quote the text verbatim, in the language of the text, even when you answer in another language.",
  "When the books hold nothing on the question, say that the books do not address it instead of answering from general knowledge.",
].join("\n");

/**
 * An author's works as read-only, citable books and sections, which the
 * importer writes through directory-sync: the book and book-section types,
 * the pages a site reads them on, the Ask page's books, a theme traced
 * across them, and each public book's EPUB staged with every site build.
 * Installed under the book class's plugin id, so its templates and data
 * sources keep their `book:` names.
 */
export const bookPackage: ServicePackageDefinition<typeof bookConfigSchema> =
  defineServicePlugin(
    {
      id: "reading",
      config: bookConfigSchema,
      entities: [book, bookSection],
      setup: (context): Record<never, never> => {
        const runtime = serviceRuntime(context);
        for (const [name, template] of Object.entries(getTemplates())) {
          runtime.template(name, template);
        }
        runtime.dataSource(bookDataSource);
        runtime.dataSource(
          bookThemeDataSource(runtime.logger.child("BookThemeDataSource")),
        );
        runtime.dataSource(
          bookAskDataSource(
            {
              // The box is named for whom the site speaks, as on the homepage.
              name: (): string => runtime.identity.getProfile().name,
              chatAvailable: (build): Promise<boolean> =>
                homepageChatAvailable(
                  build,
                  // The record Web Chat shares, read in the build's process.
                  runtime.classRuntimeState.scoped({
                    namespace: sharedStateNamespace(
                      askBoxAvailabilityState.name,
                    ),
                    schema: askBoxAvailabilityState.schema,
                  }),
                ),
            },
            runtime.logger.child("BookAskDataSource"),
          ),
        );
        subscribeToBookEpubStaging(runtime, runtime.logger);
        return {};
      },
    },
    { instructions: () => BOOK_INSTRUCTIONS },
  );

export default bookPackage;
