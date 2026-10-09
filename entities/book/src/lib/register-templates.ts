import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { contentVisibilitySchema } from "@brains/plugins";
import { bookFrontmatterSchema, bookMetadataSchema } from "../schemas/book";
import {
  bookSectionFrontmatterSchema,
  bookSectionMetadataSchema,
} from "../schemas/book-section";
import { BookAskTemplate, type BookAskProps } from "../templates/book-ask";
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

const bookSectionDisplaySchema = z.object({
  ...displayedEntity,
  entityType: z.literal("book-section"),
  metadata: bookSectionMetadataSchema,
  frontmatter: bookSectionFrontmatterSchema,
});

const bookListSchema = z.object({
  books: z.array(bookDisplaySchema),
});

const bookSectionPageSchema = z.object({
  section: bookSectionDisplaySchema,
  book: bookDisplaySchema,
  prev: bookSectionDisplaySchema.nullable(),
  next: bookSectionDisplaySchema.nullable(),
  total: z.number().int().min(0),
  themes: z.array(z.object({ id: z.string(), title: z.string() })),
});

const bookDetailSchema = z.object({
  book: bookDisplaySchema,
  first: bookSectionDisplaySchema.nullable(),
  score: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      section: z.string().nullable(),
      order: z.number().int(),
      headings: z.array(z.string()),
      length: z.number().int().min(0),
    }),
  ),
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
      z.output<typeof bookDetailSchema>,
      BookDetailProps
    >({
      name: "book-detail",
      description:
        "A book's title page: its details and the score of its sections",
      schema: bookDetailSchema,
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
  };
}
