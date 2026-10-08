import {
  parseMarkdown,
  generateMarkdownWithFrontmatter,
} from "@brains/sdk/entities";
import { book } from "../../src/book-entity";
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
