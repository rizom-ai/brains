import type { JSX } from "preact";
import { cn } from "./lib/utils";

export interface EmptyStateProps {
  message: string;
  description?: string;
  className?: string;
}

/**
 * EmptyState component - displays a centered message when no items are available
 *
 * @example
 * ```tsx
 * {items.length === 0 && (
 *   <EmptyState
 *     message="No blog posts yet."
 *     description="Blog posts will appear here as they are published."
 *   />
 * )}
 * ```
 */
export const EmptyState = ({
  message,
  description,
  className,
}: EmptyStateProps): JSX.Element => {
  return (
    <div className={cn("text-center py-12", className)}>
      <p className="text-theme-muted">{message}</p>
      {description && (
        <p className="text-sm text-theme-muted mt-2">{description}</p>
      )}
    </div>
  );
};
