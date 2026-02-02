import type { JSX, ComponentChildren } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const linkButtonVariants = cva(
  "inline-block font-semibold transition-colors text-center",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-theme-inverse hover:bg-brand-dark focus:ring-brand/20 focus:outline-none focus:ring-4",
        accent:
          "bg-accent text-theme-inverse hover:bg-accent-dark focus:ring-accent/20 focus:outline-none focus:ring-4",
        secondary:
          "bg-theme-muted text-theme hover:bg-theme-muted-dark focus:outline-none focus:ring-4",
        unstyled: "",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
        xl: "px-12 py-6 text-4xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface LinkButtonProps
  extends VariantProps<typeof linkButtonVariants> {
  href: string;
  children: ComponentChildren;
  external?: boolean;
  className?: string;
}

/**
 * LinkButton component - renders a link styled as a button
 * Perfect for CTAs and navigation actions
 */
export function LinkButton({
  href,
  children,
  variant,
  size,
  external = false,
  className,
}: LinkButtonProps): JSX.Element {
  const externalProps = external
    ? {
        target: "_blank" as const,
        rel: "noopener noreferrer",
      }
    : {};

  return (
    <a
      href={href}
      className={cn(linkButtonVariants({ variant, size }), className)}
      {...externalProps}
    >
      {children}
    </a>
  );
}

export { linkButtonVariants };
