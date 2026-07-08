import type { JSX } from "preact";
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";
import type { VariantFunction, VariantValue } from "./variant-types";

export type CardImageSize = "small" | "medium" | "large";

export interface CardImageVariantProps {
  size?: VariantValue<CardImageSize>;
}

const cardImageVariants: VariantFunction<CardImageVariantProps> = cva(
  "object-cover rounded-lg",
  {
    variants: {
      size: {
        small: "w-full sm:w-32 h-48 sm:h-32 flex-shrink-0",
        medium: "w-full sm:w-48 h-48",
        large: "w-full h-48",
      },
    },
    defaultVariants: {
      size: "medium",
    },
  },
);

export interface CardImageProps extends CardImageVariantProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Card image component with size variants for different card layouts.
 *
 * Size presets:
 * - small: 32x32 (w-32 h-32) - for horizontal cards, thumbnails
 * - medium: 48x48 (w-48 h-48) - for medium-sized previews
 * - large: full width x 48 height (w-full h-48) - for vertical cards, hero images
 *
 * @example Small image for horizontal card
 * ```tsx
 * <CardImage src="/image.jpg" alt="Post cover" size="small" />
 * ```
 *
 * @example Large image for vertical card
 * ```tsx
 * <CardImage src="/image.jpg" alt="Post cover" size="large" />
 * ```
 */
export const CardImage = ({
  src,
  alt,
  size,
  className,
}: CardImageProps): JSX.Element => {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(cardImageVariants({ size }), className)}
    />
  );
};

export { cardImageVariants };
