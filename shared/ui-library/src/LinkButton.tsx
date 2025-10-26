import type { JSX, ComponentChildren } from "preact";

export interface LinkButtonProps {
  href: string;
  children: ComponentChildren;
  variant?: "primary" | "accent" | "secondary";
  size?: "sm" | "md" | "lg" | "xl";
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
  size = "md",
  external = false,
  className = "",
}: LinkButtonProps): JSX.Element {
  // Base classes
  const baseClasses =
    "inline-block font-semibold transition-colors text-center";

  // Variant classes (only applied if variant is specified)
  const variantClasses = variant
    ? {
        primary:
          "bg-brand text-theme-inverse hover:bg-brand-dark focus:ring-brand/20",
        accent:
          "bg-accent text-theme-inverse hover:bg-accent-dark focus:ring-accent/20",
        secondary: "bg-theme-muted text-theme hover:bg-theme-muted-dark",
      }[variant]
    : "";

  // Size classes
  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
    xl: "px-12 py-6 text-4xl",
  };

  const classes = [
    baseClasses,
    variantClasses,
    sizeClasses[size],
    variant && "focus:outline-none focus:ring-4",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const externalProps = external
    ? {
        target: "_blank" as const,
        rel: "noopener noreferrer",
      }
    : {};

  return (
    <a href={href} className={classes} {...externalProps}>
      {children}
    </a>
  );
}
