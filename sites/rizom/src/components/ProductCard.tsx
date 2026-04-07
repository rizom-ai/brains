import type { JSX } from "preact";

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

// Variant-specific wrapper classes are kept verbose because each card has
// its own light/dark gradient pair and accent-tuned hover shadow.
const INNER_CLASS: Record<ProductVariant, string> = {
  rover:
    "flex flex-col-reverse md:flex-row items-center gap-6 md:gap-12 rounded-2xl md:rounded-3xl border p-6 md:p-12 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1 bg-[linear-gradient(135deg,rgba(28,16,32,0.85)_0%,rgba(20,14,28,0.85)_100%)] border-accent/15 hover:border-accent/50 hover:shadow-[0_20px_60px_-20px_rgba(232,119,34,0.25)] light:bg-[linear-gradient(135deg,#F5EDE4_0%,#F0EBE2_100%)] light:border-accent/20",
  relay:
    "flex flex-col-reverse md:flex-row-reverse items-center gap-6 md:gap-12 rounded-2xl md:rounded-3xl border p-6 md:p-12 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1 bg-[linear-gradient(135deg,rgba(22,16,42,0.85)_0%,rgba(18,14,30,0.85)_100%)] border-[rgba(140,130,200,0.2)] hover:border-[rgba(140,130,200,0.5)] hover:shadow-[0_20px_60px_-20px_rgba(107,47,160,0.25)] light:bg-[linear-gradient(135deg,#EEEAF4_0%,#ECE8F0_100%)] light:border-[rgba(107,47,160,0.2)]",
  ranger:
    "flex flex-col-reverse md:flex-row items-center gap-6 md:gap-12 rounded-2xl md:rounded-3xl border p-6 md:p-12 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1 bg-[linear-gradient(135deg,rgba(22,16,42,0.85)_0%,rgba(24,15,30,0.85)_50%,rgba(20,16,42,0.85)_100%)] border-[rgba(120,100,220,0.15)] hover:border-[rgba(140,130,200,0.4)] hover:shadow-[0_20px_60px_-20px_rgba(107,47,160,0.2)] light:bg-[linear-gradient(135deg,#EDEAF0_0%,#F0ECE5_100%)] light:border-[rgba(26,22,37,0.12)]",
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
    <section className="px-6 md:px-10 lg:px-20 relative z-[1] reveal py-4 md:py-6">
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
    </section>
  );
};
