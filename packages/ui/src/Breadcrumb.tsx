import type { JSX } from "preact";

export interface BreadcrumbItem {
  label: string;
  href?: string | undefined;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * Breadcrumb navigation component
 * Shows hierarchical path with clickable links
 * Last item is current page (no link)
 */
export function Breadcrumb({ items }: BreadcrumbProps): JSX.Element {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-theme-muted mb-6">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <span className="mx-1" aria-hidden="true">
                  /
                </span>
              )}
              {isLast || !item.href ? (
                <span className="text-heading font-medium">{item.label}</span>
              ) : (
                <a
                  href={item.href}
                  className="hover:text-brand transition-colors"
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
