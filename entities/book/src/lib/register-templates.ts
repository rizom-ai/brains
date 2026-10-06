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
  };
}
