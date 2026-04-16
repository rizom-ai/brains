import type { JSX, ComponentChildren } from "preact";
import { cn } from "@brains/ui-library";

export type ButtonVariant = "primary" | "primary-strong" | "secondary";
export type ButtonSize = "md" | "lg";

export interface ButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children?: ComponentChildren;
}

const BASE =
  "inline-flex items-center gap-2 font-body cursor-pointer transition-all";
const PRIMARY_BASE =
  "font-semibold text-[var(--color-on-accent)] bg-accent hover:bg-accent-dark";
const VARIANT: Record<ButtonVariant, string> = {
  primary: `${PRIMARY_BASE} hover:-translate-y-0.5 hover:shadow-[0_8px_32px_var(--color-glow-cta)]`,
  "primary-strong": `${PRIMARY_BASE} duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:scale-[1.02] shadow-[0_20px_60px_-15px_var(--color-glow-cta-strong)] hover:shadow-[0_0_0_8px_var(--color-glow-cta),0_30px_80px_-15px_var(--color-glow-cta-strong)]`,
  secondary:
    "font-medium text-theme bg-white/[0.04] border border-white/15 hover:border-white/40 hover:bg-white/[0.08]",
};
const SIZE: Record<ButtonSize, string> = {
  md: "text-base rounded-[10px] px-8 py-4",
  lg: "text-body-md md:text-body-lg rounded-[10px] px-6 md:px-12 py-4 md:py-[22px]",
};
const BLOCK = "w-full md:w-auto justify-center";

export const Button = ({
  href,
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
}: ButtonProps): JSX.Element => (
  <a
    href={href}
    className={cn(
      "rizom-btn",
      `rizom-btn-${variant}`,
      `rizom-btn-${size}`,
      block && "rizom-btn-block",
      BASE,
      VARIANT[variant],
      SIZE[size],
      block && BLOCK,
      className,
    )}
  >
    {children}
  </a>
);
