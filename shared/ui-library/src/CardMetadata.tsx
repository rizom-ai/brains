import type { JSX, ComponentChildren } from "preact";
import { cn } from "./lib/utils";

export interface CardMetadataProps {
  children: ComponentChildren;
  className?: string;
}

/**
 * Flexible metadata container for card components.
 *
 * Provides consistent styling for metadata sections like dates, authors,
 * tags, categories, or any other supplementary information.
 *
 * This is a generic container - plugins can compose it with their own
 * specific metadata components (like PostMetadata, DeckMetadata, etc.)
 *
 * @example With PostMetadata
 * ```tsx
 * <CardMetadata>
 *   <PostMetadata author="..." publishedAt="..." status="..." />
 * </CardMetadata>
 * ```
 *
 * @example With custom content
 * ```tsx
 * <CardMetadata>
 *   <div className="text-sm text-brand">
 *     Series: Ecosystem Architecture - Part 5
 *   </div>
 * </CardMetadata>
 * ```
 */
export const CardMetadata = ({
  children,
  className,
}: CardMetadataProps): JSX.Element => {
  return <div className={cn("mb-3", className)}>{children}</div>;
};
