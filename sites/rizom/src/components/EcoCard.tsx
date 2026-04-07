import type { JSX } from "preact";
import { cn } from "@brains/ui-library";

export interface EcoCardProps {
  /** Domain suffix shown after `rizom.` (e.g. "ai", "foundation", "work"). */
  suffix: string;
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
  /** Text-color utility for the link, matches the variant accent family. */
  linkClass: string;
  /** Gradient string for the card's top-bar accent line. */
  barGradient: string;
  /** CSS variable name for the hover glow shadow (without `var()`). */
  glowVar: string;
  /**
   * Highlights the card as the current site — replaces the link with
   * "You are here" and switches to the highlighted border + bg tokens.
   */
  active?: boolean;
  /** Reveal animation delay class (e.g. `reveal-delay-1`). */
  revealDelay?: string;
}

const BASE =
  "reveal relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-xl md:rounded-2xl border transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:opacity-60 hover:before:opacity-100 before:transition-opacity";

const HIGHLIGHTED =
  "border-[var(--color-card-eco-ai-border)] bg-[var(--color-card-eco-ai-bg)] before:!opacity-100 before:!h-[3px]";

const STANDARD =
  "border-[var(--color-card-eco-border)] bg-[var(--color-card-eco-bg)]";

export const EcoCard = ({
  suffix,
  title,
  body,
  linkLabel,
  linkHref,
  linkClass,
  barGradient,
  glowVar,
  active = false,
  revealDelay,
}: EcoCardProps): JSX.Element => (
  <div
    className={cn(
      BASE,
      revealDelay,
      active ? HIGHLIGHTED : STANDARD,
      `hover:shadow-[0_16px_40px_-16px_var(${glowVar})]`,
      `before:bg-[${barGradient}]`,
    )}
  >
    <div className="flex items-center gap-1 font-nav text-body-md mb-2">
      <span className="font-bold">rizom</span>
      <span className="font-bold text-accent">.</span>
      <span className="text-theme-muted">{suffix}</span>
    </div>
    <div className="font-nav text-heading-sm md:text-heading-lg font-bold">
      {title}
    </div>
    <p className="text-body-xs text-theme-muted">{body}</p>
    <a
      href={active ? "#" : linkHref}
      className={cn(
        "font-body text-label-md font-medium mt-2 transition-opacity hover:opacity-70",
        linkClass,
      )}
    >
      {active ? "You are here" : linkLabel}
    </a>
  </div>
);
