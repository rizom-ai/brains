import type { JSX, ComponentChildren } from "preact";
import { cn } from "./cn";

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
  "inline-flex items-center justify-center cursor-pointer border border-solid transition-all [gap:var(--rizom-btn-gap)] [border-radius:var(--rizom-btn-radius)] [font-family:var(--rizom-btn-font-family)] [font-style:var(--rizom-btn-font-style)] [letter-spacing:var(--rizom-btn-letter-spacing)] [text-transform:var(--rizom-btn-text-transform)]";
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "[font-weight:var(--rizom-btn-primary-font-weight)] [color:var(--rizom-btn-primary-color)] [background:var(--rizom-btn-primary-bg)] [border-color:var(--rizom-btn-primary-border-color)] [border-width:var(--rizom-btn-primary-border-width)] [box-shadow:var(--rizom-btn-primary-shadow)] hover:[color:var(--rizom-btn-primary-hover-color)] hover:[background:var(--rizom-btn-primary-hover-bg)] hover:[border-color:var(--rizom-btn-primary-hover-border-color)] hover:[border-width:var(--rizom-btn-primary-hover-border-width)] hover:[box-shadow:var(--rizom-btn-primary-hover-shadow)] hover:[transform:var(--rizom-btn-primary-hover-transform)]",
  "primary-strong":
    "duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] [font-weight:var(--rizom-btn-primary-strong-font-weight)] [color:var(--rizom-btn-primary-strong-color)] [background:var(--rizom-btn-primary-strong-bg)] [border-color:var(--rizom-btn-primary-strong-border-color)] [border-width:var(--rizom-btn-primary-strong-border-width)] [box-shadow:var(--rizom-btn-primary-strong-shadow)] hover:[color:var(--rizom-btn-primary-strong-hover-color)] hover:[background:var(--rizom-btn-primary-strong-hover-bg)] hover:[border-color:var(--rizom-btn-primary-strong-hover-border-color)] hover:[border-width:var(--rizom-btn-primary-strong-hover-border-width)] hover:[box-shadow:var(--rizom-btn-primary-strong-hover-shadow)] hover:[transform:var(--rizom-btn-primary-strong-hover-transform)]",
  secondary:
    "[font-weight:var(--rizom-btn-secondary-font-weight)] [color:var(--rizom-btn-secondary-color)] [background:var(--rizom-btn-secondary-bg)] [border-color:var(--rizom-btn-secondary-border-color)] [border-width:var(--rizom-btn-secondary-border-width)] [box-shadow:var(--rizom-btn-secondary-shadow)] hover:[color:var(--rizom-btn-secondary-hover-color)] hover:[background:var(--rizom-btn-secondary-hover-bg)] hover:[border-color:var(--rizom-btn-secondary-hover-border-color)] hover:[border-width:var(--rizom-btn-secondary-hover-border-width)] hover:[box-shadow:var(--rizom-btn-secondary-hover-shadow)] hover:[transform:var(--rizom-btn-secondary-hover-transform)]",
};
const SIZE: Record<ButtonSize, string> = {
  md: "text-base [padding:var(--rizom-btn-md-padding)]",
  lg: "text-body-md md:text-body-lg [padding:var(--rizom-btn-lg-padding-mobile)] md:[padding:var(--rizom-btn-lg-padding-desktop)]",
};
const BLOCK = "w-full md:w-auto";

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
