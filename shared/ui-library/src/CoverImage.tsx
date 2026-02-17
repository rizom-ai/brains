import type { JSX } from "preact";
import { cn } from "./lib/utils";

export interface CoverImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * Full-width cover image that renders at its natural aspect ratio.
 *
 * Uses CSS `aspect-ratio` for the correct proportions, `max-h-96`
 * to cap height for square/portrait images, and `object-cover` to
 * crop gracefully when the cap kicks in.
 *
 * For card/list thumbnails, use `CardImage` instead.
 */
export const CoverImage = ({
  src,
  alt,
  width,
  height,
  className,
}: CoverImageProps): JSX.Element => {
  return (
    <div className={cn("max-h-96 overflow-hidden rounded-lg", className)}>
      <img
        src={src}
        alt={alt}
        style={{ aspectRatio: `${width}/${height}` }}
        className="w-full"
      />
    </div>
  );
};
