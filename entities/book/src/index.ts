export { BookPlugin, bookPlugin } from "./plugin";
export { BookAdapter, bookAdapter } from "./adapters/book-adapter";
export {
  bookSchema,
  bookFrontmatterSchema,
  bookMetadataSchema,
  bookLicenseSchema,
  bookKindSchema,
  type Book,
  type BookFrontmatter,
  type BookMetadata,
  bookWithDataSchema,
  type BookWithData,
} from "./schemas/book";
export { BookDataSource, parseBookData } from "./datasources/book-datasource";
export { BookListTemplate, type BookListProps } from "./templates/book-list";
export {
  BookDetailTemplate,
  type BookDetailProps,
} from "./templates/book-detail";
export { bookEntrySlug } from "./adapters/book-adapter";
