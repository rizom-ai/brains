import type { ComponentChildren, JSX } from "preact";
import { ProductIllustration } from "./ProductIllustration";
import { Section } from "./Section";
import type { ProductCardContent, ProductVariant } from "./types";

const INNER_BASE =
  "group relative overflow-hidden grid gap-8 md:gap-14 rounded-[20px] border px-6 py-8 md:px-12 md:py-11 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1 before:content-[''] before:absolute before:left-0 before:right-0 before:top-0 before:h-[2px] before:opacity-70 hover:before:opacity-100 after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(circle_at_1px_1px,var(--color-card-grid-dot)_1px,transparent_0)] after:bg-[length:22px_22px] after:bg-[position:14px_14px] after:[mask-image:linear-gradient(180deg,#000_0%,#000_55%,transparent_100%)]";
const INNER_CLASS: Record<ProductVariant, string> = {
  rover: `${INNER_BASE} md:[grid-template-columns:minmax(0,1fr)_minmax(0,1.05fr)] bg-[image:var(--color-card-rover-bg)] border-[var(--color-card-rover-border)] hover:border-[var(--color-card-rover-border-hover)] hover:shadow-[0_30px_80px_-30px_var(--color-glow-rover)] before:bg-[linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)]`,
  relay: `${INNER_BASE} md:[grid-template-columns:minmax(0,1.05fr)_minmax(0,1fr)] bg-[image:var(--color-card-relay-bg)] border-[var(--color-card-relay-border)] hover:border-[var(--color-card-relay-border-hover)] hover:shadow-[0_30px_80px_-30px_var(--color-glow-relay)] before:bg-[linear-gradient(90deg,transparent,var(--color-secondary)_30%,var(--color-secondary)_70%,transparent)]`,
  ranger: `${INNER_BASE} md:[grid-template-columns:minmax(0,1fr)_minmax(0,1.05fr)] bg-[image:var(--color-card-ranger-bg)] border-[var(--color-card-ranger-border)] hover:border-[var(--color-card-ranger-border-hover)] hover:shadow-[0_30px_80px_-30px_var(--color-glow-ranger)] before:bg-[linear-gradient(90deg,transparent,var(--palette-amber-light)_18%,var(--color-secondary)_82%,transparent)]`,
};

const CORNER_BASE =
  "pointer-events-none absolute h-[14px] w-[14px] opacity-85 before:content-[''] before:absolute before:left-0 before:top-0 before:h-[1.5px] before:w-full before:bg-current after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-[1.5px] after:bg-current";

const CORNER_CLASS: Record<ProductVariant, string> = {
  rover: "text-accent",
  relay: "text-secondary",
  ranger: "text-secondary",
};

const TAGLINE_ARROW_CLASS: Record<ProductVariant, string> = {
  rover: "text-accent",
  relay: "text-secondary",
  ranger: "text-secondary",
};

const DEFAULT_TAGLINES: Record<ProductVariant, string[]> = {
  rover: ["Ingest", "Synthesize", "Publish"],
  relay: ["Map", "Track", "Retain"],
  ranger: ["Scan", "Score", "Assemble"],
};

export const ProductCard = ({
  variant,
  label,
  badge,
  headline,
  description,
  tagline,
  tags,
  backgroundWatermark,
}: ProductCardContent & {
  backgroundWatermark?: ComponentChildren;
}): JSX.Element => {
  const amber = variant === "rover";
  const isRelay = variant === "relay";
  const accentText = amber ? "text-accent" : "text-secondary";
  const badgeClasses = amber
    ? "border border-accent/45 text-accent bg-accent/10"
    : "border border-secondary/45 text-secondary bg-secondary/10";
  const tagClasses = amber ? "text-accent/90" : "text-secondary/90";
  const taglineParts =
    tagline && tagline.length > 0 ? tagline : DEFAULT_TAGLINES[variant];

  return (
    <Section className="reveal py-9">
      <div className={INNER_CLASS[variant]}>
        <span
          className={`${CORNER_BASE} ${CORNER_CLASS[variant]} left-3 top-3`}
        />
        <span
          className={`${CORNER_BASE} ${CORNER_CLASS[variant]} right-3 top-3 scale-x-[-1]`}
        />
        <span
          className={`${CORNER_BASE} ${CORNER_CLASS[variant]} bottom-3 left-3 scale-y-[-1]`}
        />
        <span
          className={`${CORNER_BASE} ${CORNER_CLASS[variant]} bottom-3 right-3 scale-[-1]`}
        />

        <div
          className={`relative z-[1] min-w-0 pt-1 ${isRelay ? "md:order-2" : ""}`}
        >
          {backgroundWatermark ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-[320px] -translate-x-1/2 -translate-y-1/2 md:w-[400px] lg:w-[460px] opacity-[0.18]">
              {backgroundWatermark}
            </div>
          ) : null}

          <div className="relative z-[1] flex flex-col gap-[18px]">
            <div className="flex flex-wrap items-baseline gap-3.5 border-b border-dashed border-[var(--color-card-divider)] pb-3.5">
              <span
                className={`font-display text-[38px] font-bold leading-none tracking-[-1.2px] md:text-[52px] ${accentText}`}
              >
                {label}
              </span>
              <span
                className={`ml-auto inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-[5px] font-mono text-[10px] font-semibold uppercase tracking-[0.2em] ${badgeClasses}`}
              >
                <span className="text-[9px] leading-none">▸</span>
                {badge}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 font-mono text-[11.5px] uppercase tracking-[0.22em] text-theme-muted">
              {taglineParts.map((part, index) => (
                <span key={`${variant}-${part}`} className="contents">
                  {index > 0 ? (
                    <span
                      className={`opacity-55 ${TAGLINE_ARROW_CLASS[variant]}`}
                    >
                      →
                    </span>
                  ) : null}
                  <span>{part}</span>
                </span>
              ))}
            </div>

            <h3 className="font-display text-[26px] font-bold leading-[1.18] tracking-[-0.6px] md:text-[36px]">
              {headline}
            </h3>
            <p className="max-w-[54ch] text-body-md leading-[1.7] text-theme-muted">
              {description}
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-x-0 gap-y-1.5 border-t border-dashed border-[var(--color-card-divider)] pt-[18px]">
              {tags.map((tag, index) => (
                <span
                  key={tag}
                  className={`font-mono text-[10px] font-medium uppercase tracking-[0.16em] ${tagClasses}`}
                >
                  {index > 0 ? (
                    <span className="pr-2.5 text-[var(--color-card-tag-separator)]">
                      /
                    </span>
                  ) : null}
                  <span className="pr-2.5">{tag}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`relative z-[1] order-first h-[220px] w-full overflow-hidden rounded-xl border border-[var(--color-card-illust-border)] bg-[linear-gradient(var(--color-card-illust-grid)_1px,transparent_1px),linear-gradient(90deg,var(--color-card-illust-grid)_1px,transparent_1px),var(--color-card-illust-overlay)] bg-[length:28px_28px,28px_28px,auto] md:h-[320px] ${isRelay ? "md:order-1" : "md:order-none"}`}
        >
          <span
            className={`${CORNER_CLASS[variant]} pointer-events-none absolute left-[10px] top-[10px] z-[2] h-[14px] w-[14px] opacity-85 before:absolute before:left-0 before:top-0 before:h-[1.5px] before:w-full before:bg-current before:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-[1.5px] after:bg-current after:content-['']`}
          />
          <span
            className={`${CORNER_CLASS[variant]} pointer-events-none absolute right-[10px] top-[10px] z-[2] h-[14px] w-[14px] opacity-85 before:absolute before:right-0 before:top-0 before:h-[1.5px] before:w-full before:bg-current before:content-[''] after:absolute after:right-0 after:top-0 after:h-full after:w-[1.5px] after:bg-current after:content-['']`}
          />
          <span
            className={`${CORNER_CLASS[variant]} pointer-events-none absolute bottom-[10px] left-[10px] z-[2] h-[14px] w-[14px] opacity-85 before:absolute before:left-0 before:bottom-0 before:h-[1.5px] before:w-full before:bg-current before:content-[''] after:absolute after:left-0 after:bottom-0 after:h-full after:w-[1.5px] after:bg-current after:content-['']`}
          />
          <span
            className={`${CORNER_CLASS[variant]} pointer-events-none absolute bottom-[10px] right-[10px] z-[2] h-[14px] w-[14px] opacity-85 before:absolute before:right-0 before:bottom-0 before:h-[1.5px] before:w-full before:bg-current before:content-[''] after:absolute after:right-0 after:bottom-0 after:h-full after:w-[1.5px] after:bg-current after:content-['']`}
          />
          <ProductIllustration variant={variant} />
        </div>
      </div>
    </Section>
  );
};
