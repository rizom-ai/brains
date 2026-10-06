import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { contentVisibilitySchema } from "@brains/plugins";
import { bookFrontmatterSchema, bookMetadataSchema } from "../schemas/book";
import { BookListTemplate, type BookListProps } from "../templates/book-list";
import {
  BookDetailTemplate,
  type BookDetailProps,
} from "../templates/book-detail";
import {
  BookThemeTemplate,
  type BookThemeProps,
} from "../templates/book-theme";

// Templates take rendered data, whose visibility is already canonical, so the
// display schema uses the plain visibility schema rather than the parser's.
const bookEntryDisplaySchema = z.object({
  id: z.string(),
  entityType: z.literal("book"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: bookMetadataSchema,
  contentHash: z.string(),
  frontmatter: bookFrontmatterSchema,
  body: z.string(),
});

const bookListSchema = z.object({
  books: z.array(bookEntryDisplaySchema),
});

const bookDetailSchema = z.object({
  entry: bookEntryDisplaySchema,
  book: bookEntryDisplaySchema,
  prev: bookEntryDisplaySchema.nullable(),
  next: bookEntryDisplaySchema.nullable(),
  total: z.number().int().min(0),
  themes: z.array(z.object({ id: z.string(), title: z.string() })),
  score: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      section: z.string().nullable(),
      order: z.number().int(),
      part: z.string().nullable(),
      length: z.number().int().min(0),
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
      description: "A book's title page or one of its sections",
      schema: bookDetailSchema,
      dataSourceId: "book:entities",
      requiredPermission: "public",
      layout: { component: BookDetailTemplate },
    }),
    theme: createTemplate<z.output<typeof bookThemeSchema>, BookThemeProps>({
      name: "theme",
      description: "A topic traced across a book brain's books",
      schema: bookThemeSchema,
      dataSourceId: "book:theme",
      requiredPermission: "public",
      layout: { component: BookThemeTemplate },
    }),
  };
}
