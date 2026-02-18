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
 * Wrapped in `w-full overflow-hidden` to create a block formatting context
 * that constrains the image in flex containers (prevents the image's
 * intrinsic width from bubbling up through the flex min-width chain).
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
    <div className={cn("w-full overflow-hidden", className)}>
      <img
        src={src}
        alt={alt}
        style={{ aspectRatio: `${width}/${height}` }}
        className="w-full h-auto rounded-lg"
      />
    </div>
  );
};
