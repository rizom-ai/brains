import type { JSX } from "preact";
import type { OverviewWithData } from "../schemas/overview";
import type { EnrichedProduct } from "../schemas/product";
import {
  Head,
  LinkButton,
  StatusBadge,
  Card,
  TagsList,
} from "@brains/ui-library";

export interface ProductsPageProps {
  overview: OverviewWithData;
  products: EnrichedProduct[];
}

/**
 * Products page template — editorial showcase of brain models
 *
 * Visual rhythm: dramatic hero → quiet vision → structured pillars →
 * dark approach break → asymmetric products → accented benefits → dark CTA
 *
 * Each section has its own visual identity — numbered pillars, accent-bar
 * approach markers, gradient-strip product cards, accent-dot benefits.
 */
export const ProductsPageTemplate = ({
  overview,
  products,
}: ProductsPageProps): JSX.Element => {
  const { frontmatter, body, labels } = overview;

  return (
    <>
      <Head title={frontmatter.headline} description={frontmatter.tagline} />

      {/* Hero — dark ground with layered drifting waves */}
      <header className="relative w-full min-h-[80vh] flex items-end px-6 md:px-12 bg-brand-dark overflow-hidden">
        <style>{`
          @keyframes wave-drift {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          @keyframes wave-drift-reverse {
            from { transform: translateX(-50%); }
            to { transform: translateX(0); }
          }
          .wave-layer-1 { animation: wave-drift 30s linear infinite; }
          .wave-layer-2 { animation: wave-drift-reverse 40s linear infinite; }
          .wave-layer-3 { animation: wave-drift 22s linear infinite; }
          @media (prefers-reduced-motion: reduce) {
            .wave-layer-1, .wave-layer-2, .wave-layer-3 { animation: none; }
          }
        `}</style>

        {/* Wave 1 — deep atmospheric swell, accent glow fading down */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <svg
            preserveAspectRatio="none"
            width="200%"
            height="100%"
            viewBox="0 0 1600 800"
            className="block absolute inset-0 wave-layer-1"
          >
            <defs>
              <linearGradient id="hero-wg-1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E7640A" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#E7640A" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,250 C133,100 267,100 400,250 C533,400 667,400 800,250 C933,100 1067,100 1200,250 C1333,400 1467,400 1600,250 V800 H0 Z"
              fill="url(#hero-wg-1)"
            />
          </svg>
        </div>

        {/* Wave 2 — counter-swell, brand glow, phase-shifted */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <svg
            preserveAspectRatio="none"
            width="200%"
            height="100%"
            viewBox="0 0 1600 800"
            className="block absolute inset-0 wave-layer-2"
          >
            <defs>
              <linearGradient id="hero-wg-2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E7640A" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#3921D7" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,350 C133,470 267,470 400,350 C533,230 667,230 800,350 C933,470 1067,470 1200,350 C1333,230 1467,230 1600,350 V800 H0 Z"
              fill="url(#hero-wg-2)"
            />
          </svg>
        </div>

        {/* Wave 3 — paired accent stroke lines (detail layer) */}
        <div className="absolute top-0 left-0 w-full h-[60%] overflow-hidden pointer-events-none">
          <svg
            preserveAspectRatio="none"
            width="200%"
            height="100%"
            viewBox="0 0 1600 400"
            className="block absolute inset-0 wave-layer-3"
          >
            <path
              d="M0,200 C67,140 133,140 200,200 C267,260 333,260 400,200 C467,140 533,140 600,200 C667,260 733,260 800,200 C867,140 933,140 1000,200 C1067,260 1133,260 1200,200 C1267,140 1333,140 1400,200 C1467,260 1533,260 1600,200"
              className="stroke-accent"
              strokeWidth="2"
              strokeMiterlimit="10"
              fill="none"
              opacity="0.2"
            />
            <path
              d="M0,230 C67,170 133,170 200,230 C267,290 333,290 400,230 C467,170 533,170 600,230 C667,290 733,290 800,230 C867,170 933,170 1000,230 C1067,290 1133,290 1200,230 C1267,170 1333,170 1400,230 C1467,290 1533,290 1600,230"
              className="stroke-accent"
              strokeWidth="1.5"
              strokeMiterlimit="10"
              fill="none"
              opacity="0.08"
            />
          </svg>
        </div>

        {/* Dot texture */}
        <div className="absolute inset-0 cta-bg-pattern pointer-events-none" />

        {/* Content — staggered entrance */}
        <div className="relative z-10 max-w-5xl mx-auto w-full pb-16 md:pb-24">
          <h1 className="text-6xl md:text-7xl lg:text-[8.5rem] font-bold text-white tracking-tighter leading-[0.95] hero-stagger-1">
            {frontmatter.headline}
          </h1>
          <div className="w-24 h-1.5 bg-accent mt-8 mb-6 md:mt-10 md:mb-8 hero-stagger-2" />
          <p className="text-lg md:text-xl text-white/70 leading-relaxed max-w-lg hero-stagger-3">
            {frontmatter.tagline}
          </p>
        </div>
      </header>

      {/* Vision — full-bleed quiet section, oversized type */}
      <section className="bg-theme-subtle py-20 md:py-32 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-10">
            {labels["vision"]}
          </h2>
          <p className="text-2xl md:text-3xl lg:text-4xl leading-relaxed text-heading font-light">
            {body.vision}
          </p>
        </div>
      </section>

      {/* Pillars — numbered grid with scale */}
      <div className="container mx-auto px-6 md:px-12 max-w-5xl py-20 md:py-32">
        <section>
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-16">
            {labels["pillars"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            {body.pillars.map((pillar, i) => (
              <div key={pillar.title}>
                <span className="text-7xl md:text-8xl font-black text-brand/15 leading-none block mb-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-bold text-heading mb-3">
                  {pillar.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Approach — full-bleed dark, accent markers + vertical dividers */}
      <section className="cta-bg-pattern bg-brand py-20 md:py-32 px-6 md:px-12">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-sm tracking-widest uppercase text-white/50 mb-16">
            {labels["approach"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-0">
            {body.approach.map((step, i) => (
              <div
                key={step.title}
                className={
                  i > 0 ? "md:border-l md:border-white/10 md:pl-12" : ""
                }
              >
                <div className="w-10 h-1 bg-accent mb-6" />
                <h3 className="text-xl font-bold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-white/70 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products + Benefits + Tech container */}
      <div className="container mx-auto px-6 md:px-12 max-w-5xl py-20 md:py-32">
        {/* Brain Models — asymmetric showcase */}
        {products.length > 0 && (
          <section className="mb-20 md:mb-32">
            <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-4">
              {labels["productsIntro"]}
            </h2>
            {body.productsIntro && (
              <p className="text-lg text-theme-muted leading-relaxed max-w-3xl mb-12">
                {body.productsIntro}
              </p>
            )}
            {!body.productsIntro && <div className="mb-12" />}

            {/* Featured product — full width with gradient strip */}
            {products[0] && <FeaturedProductCard product={products[0]} />}

            {/* Secondary products — 2-column grid */}
            {products.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                {products.slice(1).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Technologies — left border accent */}
        <section className="mb-8 md:mb-12">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            {labels["technologies"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {body.technologies.map((tech) => (
              <div key={tech.title} className="border-l-2 border-accent pl-6">
                <h3 className="text-lg font-bold text-heading mb-2">
                  {tech.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {tech.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Benefits — definition list on subtle background */}
      <section className="bg-theme-subtle py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            {labels["benefits"]}
          </h2>
          <div className="divide-y divide-theme">
            {body.benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="py-8 first:pt-0 last:pb-0 md:flex md:gap-16"
              >
                <h3 className="text-lg font-bold text-heading mb-2 md:mb-0 md:w-48 md:shrink-0">
                  {benefit.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — deep blue, product-specific call to action */}
      {/* Extra bottom padding + negative margin so the layout's WavyDivider overlaps the blue */}
      <section className="cta-bg-pattern bg-brand-dark pt-24 md:pt-32 pb-40 md:pb-48 -mb-[60px] px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm tracking-widest uppercase text-white/60 mb-4">
            {labels["cta"]}
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-white max-w-2xl mb-10">
            {body.cta.heading}
          </h2>
          <LinkButton href={body.cta.link} variant="outline-light" size="lg">
            {body.cta.buttonText}
          </LinkButton>
        </div>
      </section>
    </>
  );
};

/**
 * Featured product card — full-width with gradient top strip and
 * horizontal layout on desktop
 */
function FeaturedProductCard({
  product,
}: {
  product: EnrichedProduct;
}): JSX.Element {
  const { frontmatter, body } = product;
  const featureNames = body.features.map((f) => f.title);

  return (
    <Card
      className="overflow-hidden rounded-2xl p-0 hover:-translate-y-1 transition-all duration-300 hover:border-brand/30 group"
      href={product.url}
    >
      <div className="h-2 bg-gradient-to-r from-brand to-accent" />
      <div className="p-8 md:p-10 md:flex md:gap-12 md:items-start">
        <div className="md:flex-1">
          <div className="mb-4">
            <StatusBadge status={frontmatter.status} />
          </div>
          <h3 className="text-3xl md:text-4xl font-bold text-heading mb-3 group-hover:text-brand transition-colors">
            {frontmatter.name}
          </h3>
          <p className="text-sm font-semibold text-brand mb-4">
            {body.tagline}
          </p>
          <p className="text-theme-muted leading-relaxed text-lg">
            {body.purpose}
          </p>
        </div>
        <div className="mt-6 md:mt-0 md:w-56 md:pt-12">
          <TagsList tags={featureNames} variant="muted" size="sm" />
        </div>
      </div>
    </Card>
  );
}

/**
 * Product card — compact with brand top strip
 */
function ProductCard({ product }: { product: EnrichedProduct }): JSX.Element {
  const { frontmatter, body } = product;
  const featureNames = body.features.map((f) => f.title);

  return (
    <Card
      className="overflow-hidden rounded-2xl p-0 hover:-translate-y-1 transition-all duration-300 hover:border-brand/30 group"
      href={product.url}
    >
      <div className="h-1.5 bg-brand" />
      <div className="p-8">
        <div className="mb-4">
          <StatusBadge status={frontmatter.status} />
        </div>
        <h3 className="text-2xl font-bold text-heading mb-2 group-hover:text-brand transition-colors">
          {frontmatter.name}
        </h3>
        <p className="text-sm font-semibold text-brand mb-3">{body.tagline}</p>
        <p className="text-theme-muted leading-relaxed mb-6">{body.purpose}</p>
        <div className="mt-auto pt-4 border-t border-theme">
          <TagsList tags={featureNames} variant="muted" size="sm" />
        </div>
      </div>
    </Card>
  );
}
