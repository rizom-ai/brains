import type { JSX, ComponentChildren } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const linkButtonVariants = cva(
  "inline-flex items-center justify-center font-semibold transition-all text-center",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-theme-inverse hover:bg-brand-dark focus:ring-brand/20 focus:outline-none focus:ring-4",
        accent:
          "bg-accent text-theme-inverse hover:bg-accent-dark focus:ring-accent/20 focus:outline-none focus:ring-4",
        secondary:
          "bg-theme-muted text-theme hover:bg-theme-muted-dark focus:outline-none focus:ring-4",
        outline:
          "border-2 border-brand text-brand hover:bg-brand hover:text-theme-inverse focus:ring-brand/20 focus:outline-none focus:ring-4",
        "outline-light":
          "border-2 border-theme-light text-theme-inverse hover:bg-theme-inverse hover:text-brand hover:border-theme-inverse focus:outline-none focus:ring-4",
        unstyled: "",
      },
      size: {
        icon: "w-10 h-10 rounded-full",
        sm: "px-3 py-1.5 text-sm rounded-lg",
        md: "px-4 py-2 text-sm rounded-lg",
        lg: "px-6 py-3 text-base rounded-xl",
        xl: "px-8 py-4 text-lg rounded-xl",
        "2xl": "px-10 py-5 text-lg rounded-2xl",
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
  "aria-label"?: string;
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
  "aria-label": ariaLabel,
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
      aria-label={ariaLabel}
      {...externalProps}
    >
      {children}
    </a>
  );
}

export { linkButtonVariants };
