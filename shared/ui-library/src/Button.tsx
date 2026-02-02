import type { JSX, ComponentChildren } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "bg-brand hover:bg-brand-dark text-theme-inverse",
        secondary:
          "bg-theme-muted hover:bg-theme-subtle text-theme border border-theme",
        ghost: "hover:bg-theme-subtle text-theme",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md",
        md: "h-10 px-4 py-2 text-sm rounded-lg",
        lg: "h-12 px-6 text-base rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps extends VariantProps<typeof buttonVariants> {
  onClick?: () => void;
  children?: ComponentChildren;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export function Button({
  variant,
  size,
  className,
  children,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}

export { buttonVariants };
export default Button;
