import type { JSX } from "preact";
import type { OverviewWithData } from "../schemas/overview";
import type { EnrichedProduct } from "../schemas/product";
import {
  Head,
  LinkButton,
  StatusBadge,
  Card,
  TagsList,
  ProseContent,
} from "@brains/ui-library";
import { markdownToHtml } from "@brains/utils";

export interface ProductsPageProps {
  overview: OverviewWithData;
  products: EnrichedProduct[];
}

/**
 * Products page template — editorial showcase of brain models
 *
 * Visual rhythm: dramatic hero → warm vision+principles → dark approach →
 * clean product showcase → warm platform details → layout FooterCTA
 *
 * Consistent vocabulary: accent bars (w-10 h-1 bg-accent) mark every content
 * item, uppercase tracking-widest labels organize every section, dark/light
 * alternation (dark → subtle → dark → default → subtle) creates rhythm.
 */
export const ProductsPageTemplate = ({
  overview,
  products,
}: ProductsPageProps): JSX.Element => {
  const { frontmatter, body, labels } = overview;

  return (
    <>
      <Head title={frontmatter.headline} description={frontmatter.tagline} />

      {/* ── Hero — dark ground with layered drifting waves ── */}
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

        {/* Wave 1 — atmospheric swell with accent glow */}
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

        {/* Wave 2 — counter-swell, brand glow */}
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

        {/* Wave 3 — accent stroke lines */}
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

      {/* ── Vision + Principles — the belief and the pillars that support it ── */}
      <section className="bg-theme-subtle py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-4xl mx-auto mb-20">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-10">
            {labels["vision"]}
          </h2>
          <ProseContent
            html={markdownToHtml(body.vision.replace(/\n/g, "\n\n"))}
            className="prose-p:text-2xl prose-p:md:text-3xl prose-p:lg:text-4xl prose-p:leading-relaxed prose-p:text-heading prose-p:font-light"
          />
        </div>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            {labels["pillars"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            {body.pillars.map((pillar) => (
              <div key={pillar.title}>
                <div className="w-10 h-1 bg-accent mb-4" />
                <h3 className="text-xl font-bold text-heading mb-3">
                  {pillar.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Approach — dark panel, same accent-bar vocabulary ── */}
      <section className="cta-bg-pattern bg-brand py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-sm tracking-widest uppercase text-white/50 mb-12">
            {labels["approach"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            {body.approach.map((step) => (
              <div key={step.title}>
                <div className="w-10 h-1 bg-accent mb-4" />
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

      {/* ── Products — showcase ── */}
      {products.length > 0 && (
        <section className="py-20 md:py-28 px-6 md:px-12">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-4">
              {labels["productsIntro"]}
            </h2>
            {body.productsIntro && (
              <p className="text-lg text-theme-muted leading-relaxed max-w-3xl mb-12">
                {body.productsIntro}
              </p>
            )}
            {!body.productsIntro && <div className="mb-12" />}

            {products[0] && <FeaturedProductCard product={products[0]} />}

            {products.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                {products.slice(1).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Platform — technologies + benefits, unified on subtle background ── */}
      <section className="bg-theme-subtle py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            {labels["technologies"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-20 md:mb-28">
            {body.technologies.map((tech) => (
              <div key={tech.title}>
                <div className="w-10 h-1 bg-accent mb-4" />
                <h3 className="text-lg font-bold text-heading mb-2">
                  {tech.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {tech.description}
                </p>
              </div>
            ))}
          </div>

          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            {labels["benefits"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            {body.benefits.map((benefit) => (
              <div key={benefit.title}>
                <div className="w-10 h-1 bg-accent mb-4" />
                <h3 className="text-lg font-bold text-heading mb-2">
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

      {/* ── CTA — dark panel with wave echo and product-specific call to action ── */}
      <section className="relative bg-brand-dark overflow-hidden pt-24 md:pt-32 pb-40 md:pb-48 -mb-[60px] px-6 md:px-12">
        {/* Subtle wave echo — mirrors hero but quieter */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
          <svg
            preserveAspectRatio="none"
            width="200%"
            height="100%"
            viewBox="0 0 1600 400"
            className="block absolute inset-0"
          >
            <path
              d="M0,200 C67,140 133,140 200,200 C267,260 333,260 400,200 C467,140 533,140 600,200 C667,260 733,260 800,200 C867,140 933,140 1000,200 C1067,260 1133,260 1200,200 C1267,140 1333,140 1400,200 C1467,260 1533,260 1600,200"
              className="stroke-accent"
              strokeWidth="1.5"
              strokeMiterlimit="10"
              fill="none"
              opacity="0.3"
            />
            <path
              d="M0,240 C67,180 133,180 200,240 C267,300 333,300 400,240 C467,180 533,180 600,240 C667,300 733,300 800,240 C867,180 933,180 1000,240 C1067,300 1133,300 1200,240 C1267,180 1333,180 1400,240 C1467,300 1533,300 1600,240"
              className="stroke-accent"
              strokeWidth="1"
              strokeMiterlimit="10"
              fill="none"
              opacity="0.15"
            />
          </svg>
        </div>

        <div className="absolute inset-0 cta-bg-pattern pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="w-10 h-1 bg-accent mx-auto mb-6" />
          <p className="text-sm tracking-widest uppercase text-white/50 mb-6">
            {labels["cta"]}
          </p>
          <h2 className="text-4xl md:text-6xl font-bold text-white max-w-2xl mx-auto mb-6 tracking-tight">
            {body.cta.heading}
          </h2>
          <p className="text-lg text-white/60 max-w-lg mx-auto mb-10 leading-relaxed">
            {body.vision.split("\n")[0]}
          </p>
          <LinkButton href={body.cta.link} variant="outline-light" size="lg">
            {body.cta.buttonText}
          </LinkButton>
        </div>
      </section>
    </>
  );
};

/**
 * Featured product card — full-width with gradient accent strip,
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
      <div className="h-1.5 bg-gradient-to-r from-brand to-accent" />
      <div className="p-8 md:p-10 md:flex md:gap-12 md:items-start">
        <div className="md:flex-1">
          <div className="mb-4">
            <StatusBadge status={frontmatter.availability} />
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
 * Product card — compact with gradient accent strip
 */
function ProductCard({ product }: { product: EnrichedProduct }): JSX.Element {
  const { frontmatter, body } = product;
  const featureNames = body.features.map((f) => f.title);

  return (
    <Card
      className="overflow-hidden rounded-2xl p-0 hover:-translate-y-1 transition-all duration-300 hover:border-brand/30 group"
      href={product.url}
    >
      <div className="h-1.5 bg-gradient-to-r from-brand to-accent" />
      <div className="p-8">
        <div className="mb-4">
          <StatusBadge status={frontmatter.availability} />
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
