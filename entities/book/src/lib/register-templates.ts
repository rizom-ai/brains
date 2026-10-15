import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { contentVisibilitySchema } from "@brains/plugins";
import { bookFrontmatterSchema, bookMetadataSchema } from "../schemas/book";
import {
  bookDetailPageSchema,
  bookSectionPageSchema,
} from "../schemas/book-pages";
import { BookAskTemplate, type BookAskProps } from "../templates/book-ask";
import {
  BookEpub,
  bookEpubSchema,
  type BookEpubData,
} from "../templates/book-epub";
import { BookListTemplate, type BookListProps } from "../templates/book-list";
import {
  BookDetailTemplate,
  BookSectionTemplate,
  type BookDetailProps,
  type BookSectionProps,
} from "../templates/book-detail";
import {
  BookThemeTemplate,
  type BookThemeProps,
} from "../templates/book-theme";

// Templates take rendered data, whose visibility is already canonical, so the
// display schema uses the plain visibility schema rather than the parser's.
const displayedEntity = {
  id: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  contentHash: z.string(),
  body: z.string(),
};

const bookDisplaySchema = z.object({
  ...displayedEntity,
  entityType: z.literal("book"),
  metadata: bookMetadataSchema,
  frontmatter: bookFrontmatterSchema,
});

const bookListSchema = z.object({
  books: z.array(bookDisplaySchema),
});

const bookAskSchema = z.object({
  name: z.string(),
  askBox: z.boolean(),
  books: z.array(
    z.object({
      book: z.string(),
      title: z.string(),
      year: z.number().nullable(),
    }),
  ),
});

const bookThemeSchema = z.object({
  theme: z.object({ id: z.string(), title: z.string(), summary: z.string() }),
  strand: z.array(
    z.object({
      book: z.string(),
      title: z.string(),
      shortTitle: z.string().nullable(),
      year: z.number().int().nullable(),
      published: z.boolean(),
      sections: z.number().int().min(0),
    }),
  ),
  passages: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      section: z.string().nullable(),
      bookTitle: z.string(),
    }),
  ),
});

export function getTemplates(): Record<string, Template> {
  return {
    "book-list": createTemplate<z.output<typeof bookListSchema>, BookListProps>(
      {
        name: "book-list",
        description: "Index of books",
        schema: bookListSchema,
        dataSourceId: "book:entities",
        requiredPermission: "public",
        layout: { component: BookListTemplate },
      },
    ),
    "book-detail": createTemplate<
      z.output<typeof bookDetailPageSchema>,
      BookDetailProps
    >({
      name: "book-detail",
      description:
        "A book's title page: its details and the score of its sections",
      schema: bookDetailPageSchema,
      dataSourceId: "book:entities",
      requiredPermission: "public",
      layout: { component: BookDetailTemplate },
    }),
    "book-section-detail": createTemplate<
      z.output<typeof bookSectionPageSchema>,
      BookSectionProps
    >({
      name: "book-section-detail",
      description: "A section of a book, set for reading",
      schema: bookSectionPageSchema,
      dataSourceId: "book:entities",
      requiredPermission: "public",
      layout: { component: BookSectionTemplate },
    }),
    theme: createTemplate<z.output<typeof bookThemeSchema>, BookThemeProps>({
      name: "theme",
      description: "A topic traced across a book brain's books",
      schema: bookThemeSchema,
      dataSourceId: "book:theme",
      requiredPermission: "public",
      layout: { component: BookThemeTemplate },
    }),
    ask: createTemplate<z.output<typeof bookAskSchema>, BookAskProps>({
      name: "ask",
      description: "Asking a book brain, with the passages its answer cites",
      schema: bookAskSchema,
      dataSourceId: "book:ask",
      requiredPermission: "public",
      layout: { component: BookAskTemplate },
    }),
    epub: createTemplate<BookEpubData>({
      name: "epub",
      description: "A book as an EPUB, one chapter per section",
      schema: bookEpubSchema,
      requiredPermission: "public",
      layout: { formats: { epub: BookEpub } },
    }),
  };
}
