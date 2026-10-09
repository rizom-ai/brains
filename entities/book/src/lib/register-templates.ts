import {
  createTemplate,
  contentVisibilitySchema,
  z,
  type Template,
} from "@brains/sdk/entities";
import { bookFrontmatterSchema, bookMetadataSchema } from "../schemas/book";
import { BookAskTemplate, type BookAskProps } from "../templates/book-ask";
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
        dataSourceId: "entities",
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
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: { component: BookDetailTemplate },
    }),
    theme: createTemplate<z.output<typeof bookThemeSchema>, BookThemeProps>({
      name: "theme",
      description: "A topic traced across a book brain's books",
      schema: bookThemeSchema,
      dataSourceId: "theme",
      requiredPermission: "public",
      layout: { component: BookThemeTemplate },
    }),
    ask: createTemplate<z.output<typeof bookAskSchema>, BookAskProps>({
      name: "ask",
      description: "Asking a book brain, with the passages its answer cites",
      schema: bookAskSchema,
      dataSourceId: "@brains/book:ask",
      requiredPermission: "public",
      layout: { component: BookAskTemplate },
    }),
  };
}
