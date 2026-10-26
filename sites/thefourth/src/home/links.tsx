import type { JSX } from "react";
import { z } from "@rizom/site";

/** A labelled destination: a CTA's words and where they go. */
export const linkSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
}> = z.object({ label: z.string(), href: z.string() });

export type Link = z.infer<typeof linkSchema>;

/** The paper colors a button comes in. */
export type ButtonTone = "ink" | "card" | "red" | "mustard";

/** A pill-shaped link that lifts under the wand. */
export function ButtonLink({
  link,
  tone,
}: {
  link: Link;
  tone: ButtonTone;
}): JSX.Element {
  return (
    <a className={`tf-btn tf-btn--${tone}`} href={link.href}>
      {link.label}
    </a>
  );
}

/** An underlined link whose line thickens under the wand. */
export function TextLink({ link }: { link: Link }): JSX.Element {
  return (
    <a className="tf-link" href={link.href}>
      {link.label}
    </a>
  );
}
