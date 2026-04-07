import type { JSX } from "preact";
import { Section } from "./Section";

export type ProductVariant = "rover" | "relay" | "ranger";

export interface ProductCardProps {
  variant: ProductVariant;
  label: string;
  badge: string;
  headline: string;
  description: string;
  tags: string[];
  canvasId: string;
}

// Gradients, borders, and glow colors are driven by --color-card-*
// tokens in theme-rizom, so both dark and light modes flow through
// the theme variables. Only layout direction is variant-specific here.
const INNER_BASE =
  "flex flex-col-reverse items-center gap-6 md:gap-12 rounded-2xl md:rounded-3xl border p-6 md:p-12 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1";
const INNER_CLASS: Record<ProductVariant, string> = {
  rover: `${INNER_BASE} md:flex-row bg-[var(--color-card-rover-bg)] border-[var(--color-card-rover-border)] hover:border-[var(--color-card-rover-border-hover)] hover:shadow-[0_20px_60px_-20px_var(--color-glow-rover)]`,
  relay: `${INNER_BASE} md:flex-row-reverse bg-[var(--color-card-relay-bg)] border-[var(--color-card-relay-border)] hover:border-[var(--color-card-relay-border-hover)] hover:shadow-[0_20px_60px_-20px_var(--color-glow-relay)]`,
  ranger: `${INNER_BASE} md:flex-row bg-[var(--color-card-ranger-bg)] border-[var(--color-card-ranger-border)] hover:border-[var(--color-card-ranger-border-hover)] hover:shadow-[0_20px_60px_-20px_var(--color-glow-ranger)]`,
};

export const ProductCard = ({
  variant,
  label,
  badge,
  headline,
  description,
  tags,
  canvasId,
}: ProductCardProps): JSX.Element => {
  const amber = variant === "rover";
  const accentText = amber ? "text-accent" : "text-secondary";
  const badgeClasses = amber
    ? "border border-accent/30 text-accent bg-accent/10"
    : "border border-secondary/30 text-secondary bg-secondary/10";
  const tagClasses = amber
    ? "text-accent/60 light:text-accent-dark"
    : "text-secondary/55 light:text-secondary";

  return (
    <Section className="reveal py-4 md:py-6">
      <div className={INNER_CLASS[variant]}>
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`font-nav font-bold text-[16px] md:text-[24px] tracking-[2px] md:tracking-[3px] uppercase ${accentText}`}
            >
              {label}
            </span>
            <span
              className={`inline-flex px-2.5 py-1 rounded-xl font-label text-label-xs font-bold tracking-[1.5px] uppercase ${badgeClasses}`}
            >
              {badge}
            </span>
          </div>
          <h3 className="font-display text-[24px] tracking-[-0.5px] leading-[1.2] md:text-display-sm">
            {headline}
          </h3>
          <p className="text-body-xs md:text-body-md text-theme-muted">
            {description}
          </p>
          <div className="flex flex-wrap gap-x-[18px] md:gap-x-6 gap-y-2.5 pt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`font-label text-label-sm md:text-label-md font-semibold ${tagClasses}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 w-full md:w-[511px] h-[180px] md:h-[320px] rounded-xl md:rounded-2xl overflow-hidden relative">
          <canvas id={canvasId} width={511} height={320} />
        </div>
      </div>
    </Section>
  );
};
