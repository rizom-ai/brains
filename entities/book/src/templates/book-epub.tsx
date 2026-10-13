import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@brains/utils/zod";

/** A book as an EPUB carries it: its title and its sections in reading order. */
export const bookEpubSchema: z.ZodObject<{
  title: z.ZodString;
  author: z.ZodNullable<z.ZodString>;
  sections: z.ZodArray<
    z.ZodObject<{
      title: z.ZodString;
      headings: z.ZodArray<z.ZodString>;
      body: z.ZodString;
    }>
  >;
}> = z.object({
  title: z.string(),
  author: z.string().nullable(),
  sections: z.array(
    z.object({
      title: z.string(),
      /** The headings the section stands under, outermost first. */
      headings: z.array(z.string()),
      body: z.string(),
    }),
  ),
});

export type BookEpubData = z.output<typeof bookEpubSchema>;

const HEADING_TAGS: readonly ("h1" | "h2" | "h3" | "h4" | "h5" | "h6")[] = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

/** A heading at its depth, from h1; deeper than six stays at h6. */
const Heading = ({
  level,
  children,
}: {
  level: number;
  children: string;
}): JSX.Element => {
  const Tag = HEADING_TAGS[Math.min(level, 6) - 1] ?? "h6";
  return <Tag>{children}</Tag>;
};

/** How many of a section's headings it shares with the section before. */
function sharedHeadings(headings: string[], previous: string[]): number {
  const differs = headings.findIndex(
    (heading, depth) => heading !== previous[depth],
  );
  return differs === -1 ? headings.length : differs;
}

/**
 * Each section is one chapter of the EPUB, marked with the headings it stands
 * under; a heading is set in the text where it opens.
 */
export const BookEpub = ({ sections }: BookEpubData): JSX.Element => (
  <article>
    {sections.map((section, index) => {
      const opens = sharedHeadings(
        section.headings,
        sections[index - 1]?.headings ?? [],
      );
      return (
        <section
          key={index}
          data-epub-chapter={section.title}
          data-epub-headings={JSON.stringify(section.headings)}
        >
          {section.headings.slice(opens).map((heading, depth) => (
            <Heading key={heading} level={opens + depth + 1}>
              {heading}
            </Heading>
          ))}
          <Heading level={section.headings.length + 1}>{section.title}</Heading>
          <MarkdownContent markdown={section.body} />
        </section>
      );
    })}
  </article>
);
