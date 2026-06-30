import type { ComponentChildren, JSX } from "preact";

export const QUIZ_HREF = "https://form.typeform.com/to/NGqo9Fnf";
export const BOOKING_HREF = "mailto:contact@rizom.ai";

const NEW_TAB_HREFS = new Set([QUIZ_HREF, BOOKING_HREF]);

export function newTabProps(href: string): { target?: string; rel?: string } {
  return NEW_TAB_HREFS.has(href)
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

export type WorkButtonVariant = "primary" | "primary-strong" | "secondary";
export type WorkButtonSize = "md" | "lg";

interface WorkButtonProps {
  href: string;
  variant?: WorkButtonVariant;
  size?: WorkButtonSize;
  block?: boolean;
  className?: string;
  children?: ComponentChildren;
}

const BASE =
  "inline-flex items-center justify-center cursor-pointer border border-solid transition-all [gap:var(--rizom-btn-gap)] [border-radius:var(--rizom-btn-radius)] [font-family:var(--rizom-btn-font-family)] [font-style:var(--rizom-btn-font-style)] [letter-spacing:var(--rizom-btn-letter-spacing)] [text-transform:var(--rizom-btn-text-transform)]";

const VARIANT: Record<WorkButtonVariant, string> = {
  primary:
    "[font-weight:var(--rizom-btn-primary-font-weight)] [color:var(--rizom-btn-primary-color)] [background:var(--rizom-btn-primary-bg)] [border-color:var(--rizom-btn-primary-border-color)] [border-width:var(--rizom-btn-primary-border-width)] [box-shadow:var(--rizom-btn-primary-shadow)] hover:[color:var(--rizom-btn-primary-hover-color)] hover:[background:var(--rizom-btn-primary-hover-bg)] hover:[border-color:var(--rizom-btn-primary-hover-border-color)] hover:[border-width:var(--rizom-btn-primary-hover-border-width)] hover:[box-shadow:var(--rizom-btn-primary-hover-shadow)] hover:[transform:var(--rizom-btn-primary-hover-transform)]",
  "primary-strong":
    "duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] [font-weight:var(--rizom-btn-primary-strong-font-weight)] [color:var(--rizom-btn-primary-strong-color)] [background:var(--rizom-btn-primary-strong-bg)] [border-color:var(--rizom-btn-primary-strong-border-color)] [border-width:var(--rizom-btn-primary-strong-border-width)] [box-shadow:var(--rizom-btn-primary-strong-shadow)] hover:[color:var(--rizom-btn-primary-strong-hover-color)] hover:[background:var(--rizom-btn-primary-strong-hover-bg)] hover:[border-color:var(--rizom-btn-primary-strong-hover-border-color)] hover:[border-width:var(--rizom-btn-primary-strong-hover-border-width)] hover:[box-shadow:var(--rizom-btn-primary-strong-hover-shadow)] hover:[transform:var(--rizom-btn-primary-strong-hover-transform)]",
  secondary:
    "[font-weight:var(--rizom-btn-secondary-font-weight)] [color:var(--rizom-btn-secondary-color)] [background:var(--rizom-btn-secondary-bg)] [border-color:var(--rizom-btn-secondary-border-color)] [border-width:var(--rizom-btn-secondary-border-width)] [box-shadow:var(--rizom-btn-secondary-shadow)] hover:[color:var(--rizom-btn-secondary-hover-color)] hover:[background:var(--rizom-btn-secondary-hover-bg)] hover:[border-color:var(--rizom-btn-secondary-hover-border-color)] hover:[border-width:var(--rizom-btn-secondary-hover-border-width)] hover:[box-shadow:var(--rizom-btn-secondary-hover-shadow)] hover:[transform:var(--rizom-btn-secondary-hover-transform)]",
};

const SIZE: Record<WorkButtonSize, string> = {
  md: "text-base [padding:var(--rizom-btn-md-padding)]",
  lg: "text-body-md md:text-body-lg [padding:var(--rizom-btn-lg-padding-mobile)] md:[padding:var(--rizom-btn-lg-padding-desktop)]",
};

const BLOCK = "w-full md:w-auto";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const WorkButton = ({
  href,
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
}: WorkButtonProps): JSX.Element => (
  <a
    href={href}
    {...newTabProps(href)}
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
