import type { JSX } from "preact";
import { cn } from "./lib/utils";

export interface SourceReferenceCardProps {
  id: string;
  title: string;
  type: string;
  excerpt?: string;
  href: string;
  className?: string;
}

/**
 * Clickable card linking to source content with title, type, and optional excerpt
 */
export const SourceReferenceCard = ({
  id,
  title,
  type,
  excerpt,
  href,
  className,
}: SourceReferenceCardProps): JSX.Element => {
  const displayType = type === "conversation" ? "Conversation Summary" : type;

  return (
    <a
      key={id}
      href={href}
      className={cn(
        "block p-4 bg-theme-subtle rounded-lg hover:bg-theme-muted transition-colors border border-theme",
        className,
      )}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium text-theme hover:text-brand transition-colors">
            {title}
          </h3>
          <p className="text-sm text-theme-muted mt-1">{displayType}</p>
          {excerpt && (
            <p className="text-sm mt-2 text-theme-muted italic">{excerpt}</p>
          )}
        </div>
      </div>
    </a>
  );
};
