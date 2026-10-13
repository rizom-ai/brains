export { BookPlugin, bookPlugin } from "./plugin";
export { BookAdapter, bookAdapter } from "./adapters/book-adapter";
export {
  BookSectionAdapter,
  bookSectionAdapter,
  bookSectionSlug,
} from "./adapters/book-section-adapter";
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
export {
  bookSectionSchema,
  bookSectionFrontmatterSchema,
  bookSectionMetadataSchema,
  type BookSection,
  type BookSectionFrontmatter,
  type BookSectionMetadata,
  bookSectionWithDataSchema,
  type BookSectionWithData,
} from "./schemas/book-section";
export {
  BookDataSource,
  parseBookData,
  parseBookSectionData,
} from "./datasources/book-datasource";
export { BookListTemplate, type BookListProps } from "./templates/book-list";
export {
  BookDetailTemplate,
  BookSectionTemplate,
  type BookDetailProps,
  type BookSectionProps,
} from "./templates/book-detail";
