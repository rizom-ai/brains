import type { JSX } from "react";

const IMAGE_MARKDOWN = /^!\[([^\]]*)\]\(entity:\/\/image\/([^)\s]+)\)$/;

/**
 * A photo field holds the brain's image as markdown,
 * `![alt](entity://image/<id>)`, so the site build collects the image and
 * writes it to /images/<id>.webp. Anything else is no photo.
 */
export function parsePhoto(
  markdown: string,
): { alt: string; src: string } | null {
  const match = IMAGE_MARKDOWN.exec(markdown.trim());
  if (!match?.[2]) return null;
  return { alt: match[1] ?? "", src: `/images/${match[2]}.webp` };
}

/** A photo cut out as a keyhole, in grey, with the cut-out's shadow. */
export function Portrait({
  photo,
  className,
}: {
  photo: string;
  className?: string;
}): JSX.Element | null {
  const parsed = parsePhoto(photo);
  if (!parsed) return null;
  return (
    <div className={["tf-portrait", className].filter(Boolean).join(" ")}>
      <img src={parsed.src} alt={parsed.alt} loading="lazy" />
    </div>
  );
}
