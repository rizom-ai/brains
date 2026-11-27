import {
  StructuredContentFormatter,
  formatSourceList,
  parseSourceList,
  storedSourceSchema,
  type FieldMapping,
} from "@brains/content-formatters";
import { recordFields } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  seminarBodySchema,
  seminarFrontmatterSchema,
  type SeminarBody,
  type SeminarFrontmatter,
  type SeminarMetadata,
  type SeminarTurn,
} from "../schemas/seminar";

/*
 * A seminar's markdown (docs/external-plugin-authoring.md, The stored format):
 * its header is its metadata, and its body states each turn under its own
 * heading. Who spoke and in which round are labeled lines, what they said
 * is the turn's plain text, and its sources are a linked list. The formatter
 * escapes a heading inside an answer, so a peer's own headings never open a
 * section.
 */

const seminarBodyMappings: FieldMapping[] = [
  {
    key: "turns",
    label: "Turns",
    type: "array",
    itemType: "object",
    itemLabel: "Turn",
    itemMappings: [
      { key: "round", label: "Round", type: "string", line: true },
      { key: "speaker", label: "Speaker", type: "string", line: true },
      { key: "name", label: "Name", type: "string", line: true },
      { key: "failed", label: "Failed", type: "string", line: true },
      { key: "text", label: "Text", type: "string" },
      { key: "to", label: "To", type: "array", itemType: "string" },
      {
        key: "sources",
        label: "Sources",
        type: "custom",
        formatter: (value: unknown): string =>
          formatSourceList(z.array(storedSourceSchema).parse(value)),
        parser: parseSourceList,
      },
    ],
  },
];

const seminarBodyFormatter: StructuredContentFormatter<SeminarBody> =
  new StructuredContentFormatter(seminarBodySchema, {
    title: "Seminar",
    layout: "compact",
    mappings: seminarBodyMappings,
  });

/** Markdown body ↔ seminar body; a write is validated like a read. */
export const seminarBodyCodec: typeof seminarBodyFormatter.codec =
  seminarBodyFormatter.codec;

/** A seminar's body as stored: each turn under its heading. */
export function seminarBody(body: SeminarBody): string {
  return z.encode(seminarBodyCodec, body);
}

/** A stored body's turns. */
export function readSeminarBody(body: string): SeminarBody {
  return z.decode(seminarBodyCodec, body);
}

/** A seminar as its readers take it: its fields and its turns. */
export interface SeminarParts {
  frontmatter: SeminarFrontmatter;
  turns: SeminarTurn[];
}

/**
 * A seminar as read: its fields from its metadata, or from the stored
 * document when it is read as stored, and its body's turns.
 */
export function readSeminar(record: {
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}): SeminarParts {
  const { fields, body } = recordFields(record);
  return {
    frontmatter: seminarFrontmatterSchema.parse(fields),
    turns: readSeminarBody(body).turns,
  };
}

/** What a seminar write stores: its body, and its fields as metadata. */
export function seminarRecord(
  frontmatter: SeminarFrontmatter,
  body: SeminarBody,
): { content: string; metadata: SeminarMetadata } {
  return {
    content: seminarBody(body),
    metadata: seminarFrontmatterSchema.parse(frontmatter),
  };
}
