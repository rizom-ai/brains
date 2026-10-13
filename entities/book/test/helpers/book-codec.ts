import {
  parseMarkdown,
  generateMarkdownWithFrontmatter,
} from "@brains/sdk/entities";
import { book } from "../../src/book-entity";
import { bookSection } from "../../src/book-section-entity";
import {
  bookSectionFrontmatterSchema,
  bookSectionMetadataSchema,
  type BookSection,
} from "../../src/schemas/book-section";
import {
  bookFrontmatterSchema,
  bookMetadataSchema,
  type Book,
} from "../../src/schemas/book";

type BookCodec = NonNullable<typeof book.markdown>;
function requiredCodec(): Required<Pick<BookCodec, "decode" | "encode">> {
  const value = book.markdown;
  if (!value?.decode) throw new Error("Missing book markdown codec");
  return { decode: value.decode, encode: value.encode };
}
const codec = requiredCodec();
export function decodeBook(
  markdown: string,
): Pick<Book, "entityType" | "content" | "metadata"> {
  const parsed = parseMarkdown(markdown);
  const result = codec.decode({
    content: parsed.content,
    frontmatter: parsed.frontmatter,
  });
  return {
    entityType: "book",
    content: result.content,
    metadata: bookMetadataSchema.parse(result.metadata),
  };
}
export function encodeBook(entity: Book): string {
  const result = codec.encode(entity);
  return generateMarkdownWithFrontmatter(result.content, {
    ...result.frontmatter,
  });
}
export function bookFields(
  markdown: string,
): ReturnType<typeof bookFrontmatterSchema.parse> {
  return bookFrontmatterSchema.parse(parseMarkdown(markdown).frontmatter);
}

export function decodeSection(
  markdown: string,
): Pick<BookSection, "entityType" | "content" | "metadata"> {
  const value = bookSection.markdown;
  if (!value?.decode) throw new Error("Missing section markdown codec");
  const parsed = parseMarkdown(markdown);
  const result = value.decode({
    content: parsed.content,
    frontmatter: parsed.frontmatter,
  });
  return {
    entityType: "book-section",
    content: result.content,
    metadata: bookSectionMetadataSchema.parse(result.metadata),
  };
}
export function encodeSection(entity: BookSection): string {
  const value = bookSection.markdown;
  if (!value) throw new Error("Missing section markdown codec");
  const result = value.encode(entity);
  return generateMarkdownWithFrontmatter(result.content, {
    ...result.frontmatter,
  });
}
export function sectionFields(
  markdown: string,
): ReturnType<typeof bookSectionFrontmatterSchema.parse> {
  return bookSectionFrontmatterSchema.parse(
    parseMarkdown(markdown).frontmatter,
  );
}
