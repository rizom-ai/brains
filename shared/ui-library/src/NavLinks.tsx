import type { JSX, ComponentChildren } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const navLinksVariants = cva("flex flex-wrap", {
  variants: {
    orientation: {
      horizontal: "justify-center gap-6 items-center",
      vertical: "flex-col gap-3",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

export interface NavLinksProps extends VariantProps<typeof navLinksVariants> {
  items: NavigationItem[];
  className?: string;
  linkClassName?: string;
  children?: ComponentChildren;
}

/**
 * NavLinks component - renders a list of navigation links
 * Automatically sorts items by priority
 * Accepts children to render additional items inside the same <ul>
 */
export function NavLinks({
  items,
  className,
  linkClassName = "hover:text-accent transition-colors",
  orientation,
  children,
}: NavLinksProps): JSX.Element | null {
  if (items.length === 0 && !children) return null;

  // Sort by priority
  const sortedItems = [...items].sort((a, b) => a.priority - b.priority);

  return (
    <ul className={cn(navLinksVariants({ orientation }), className)}>
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

export { navLinksVariants };
