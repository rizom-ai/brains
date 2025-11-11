import type { JSX } from "preact";

export type CardImageSize = "small" | "medium" | "large";

export interface CardImageProps {
  src: string;
  alt: string;
  size?: CardImageSize;
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
  size = "medium",
  className = "",
}: CardImageProps): JSX.Element => {
  const sizeClasses = {
    small: "w-32 h-32",
    medium: "w-48 h-48",
    large: "w-full h-48",
  };

  const baseClasses = "object-cover rounded-lg";
  const flexClasses = size === "small" ? "flex-shrink-0" : "";

  const classes = `${baseClasses} ${sizeClasses[size]} ${flexClasses} ${className}`;

  return <img src={src} alt={alt} className={classes} />;
};
