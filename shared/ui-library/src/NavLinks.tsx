import type { JSX, ComponentChildren } from "preact";

export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

export interface NavLinksProps {
  items: NavigationItem[];
  className?: string;
  linkClassName?: string;
  orientation?: "horizontal" | "vertical";
  children?: ComponentChildren;
}

/**
 * NavLinks component - renders a list of navigation links
 * Automatically sorts items by priority
 * Accepts children to render additional items inside the same <ul>
 */
export function NavLinks({
  items,
  className = "",
  linkClassName = "hover:text-accent transition-colors",
  orientation = "horizontal",
  children,
}: NavLinksProps): JSX.Element | null {
  if (items.length === 0 && !children) return null;

  // Sort by priority
  const sortedItems = [...items].sort((a, b) => a.priority - b.priority);

  const listClasses = [
    "flex flex-wrap",
    orientation === "horizontal"
      ? "justify-center gap-6 items-center"
      : "flex-col gap-3",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ul className={listClasses}>
      {sortedItems.map((item) => (
        <li key={item.href}>
          <a href={item.href} className={linkClassName}>
            {item.label}
          </a>
        </li>
      ))}
      {children}
    </ul>
  );
}
