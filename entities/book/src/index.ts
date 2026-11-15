import { bookPackage } from "./plugin";

export { bookPackage } from "./plugin";
export { book } from "./book-entity";
export { bookSection } from "./book-section-entity";
export { bookSectionSlug, bookSectionSlugPrefix } from "./lib/slugs";
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
  fetchBookData,
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

export default bookPackage;
