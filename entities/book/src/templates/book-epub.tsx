import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@brains/utils/zod";

/** A book as an EPUB carries it: its title and its sections in reading order. */
export const bookEpubSchema: z.ZodObject<{
  title: z.ZodString;
  author: z.ZodNullable<z.ZodString>;
  sections: z.ZodArray<z.ZodObject<{ title: z.ZodString; body: z.ZodString }>>;
}> = z.object({
  title: z.string(),
  author: z.string().nullable(),
  sections: z.array(z.object({ title: z.string(), body: z.string() })),
});

export type BookEpubData = z.output<typeof bookEpubSchema>;

/** Each section is one chapter of the EPUB, marked for the package. */
export const BookEpub = ({ sections }: BookEpubData): JSX.Element => (
  <article>
    {sections.map((section, index) => (
      <section key={index} data-epub-chapter={section.title}>
        <h2>{section.title}</h2>
        <MarkdownContent markdown={section.body} />
      </section>
    ))}
  </article>
);
