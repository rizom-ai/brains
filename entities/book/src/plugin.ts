import type {
  DataSource,
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { bookSchema, type Book } from "./schemas/book";
import { bookAdapter, type BookAdapter } from "./adapters/book-adapter";
import { bookSectionAdapter } from "./adapters/book-section-adapter";
import { bookSectionSchema } from "./schemas/book-section";
import { homepageChatAvailable } from "@brains/site-atlas";
import { BookAskDataSource } from "./datasources/book-ask-datasource";
import { BookDataSource } from "./datasources/book-datasource";
import { BookThemeDataSource } from "./datasources/book-theme-datasource";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

/** The importer writes books through directory-sync; no one edits them. */
const READ_ONLY: NonNullable<EntityTypeConfig["actionPolicy"]> = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
};

export class BookPlugin extends EntityPlugin<
  Book,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: typeof bookAdapter.entityType = bookAdapter.entityType;
  readonly schema: typeof bookSchema = bookSchema;
  readonly adapter: BookAdapter = bookAdapter;

  constructor() {
    super("book", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      classification: "content",
      includeInBroadSearch: true,
      // A book is its details and contents; its text is in its sections.
      projectionSource: false,
      projectionSourceRole: "excluded",
      actionPolicy: READ_ONLY,
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.entities.register(
      bookSectionAdapter.entityType,
      bookSectionSchema,
      bookSectionAdapter,
      {
        classification: "content",
        includeInBroadSearch: true,
        // A book brain's sections are its primary texts; its topics map their themes.
        projectionSourceRole: "canonical",
        // Ids carry zero-padded reading order.
        defaultSort: [{ field: "id", direction: "asc" }],
        actionPolicy: READ_ONLY,
        // A section lives in its book: stored, shown and deleted with it.
        containedIn: bookAdapter.entityType,
      },
    );
  }

  protected override async getInstructions(): Promise<string> {
    return [
      'Books (entityType "book") hold an author\'s works; their text is in their sections (entityType "book-section"), whose `section` is their siglum.',
      'When a question concerns the author\'s ideas or texts, search the sections first: system_search with scope { kind: "type", entityType: "book-section" }.',
      "Ground every claim in sections you found, and cite each section by its siglum and its book's title.",
      "Quote the text verbatim, in the language of the text, even when you answer in another language.",
      "When the books hold nothing on the question, say that the books do not address it instead of answering from general knowledge.",
    ].join("\n");
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [
      new BookDataSource(this.logger.child("BookDataSource")),
      new BookThemeDataSource(this.logger.child("BookThemeDataSource")),
      new BookAskDataSource(this.logger.child("BookAskDataSource"), {
        // The box is named for whom the site speaks, as on the homepage.
        name: (): string => this.getContext().identity.getProfile().name,
        chatAvailable: (buildContext): Promise<boolean> =>
          homepageChatAvailable(buildContext, this.getContext()),
      }),
    ];
  }
}

export function bookPlugin(): Plugin {
  return new BookPlugin();
}
