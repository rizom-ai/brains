import type {
  DataSource,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { bookSchema, type Book } from "./schemas/book";
import { bookAdapter, type BookAdapter } from "./adapters/book-adapter";
import { BookDataSource } from "./datasources/book-datasource";
import { BookThemeDataSource } from "./datasources/book-theme-datasource";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

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
      // A book brain's books are its primary texts; its topics map their themes.
      projectionSourceRole: "canonical",
      // Ids carry zero-padded reading order.
      defaultSort: [{ field: "id", direction: "asc" }],
      // The importer writes books through directory-sync; no one edits them.
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    };
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [
      new BookDataSource(this.logger.child("BookDataSource")),
      new BookThemeDataSource(this.logger.child("BookThemeDataSource")),
    ];
  }
}

export function bookPlugin(): Plugin {
  return new BookPlugin();
}
