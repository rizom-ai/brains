import type { JSX } from "preact";
import type { EnrichedProduct } from "../schemas/product";
import {
  Head,
  StatusBadge,
  TagsList,
  Breadcrumb,
  LinkButton,
  type BreadcrumbItem,
} from "@brains/ui-library";

export interface ProductDetailProps {
  product: EnrichedProduct;
}

/**
 * Product detail page template — editorial deep-dive into a single brain model
 *
 * Visual rhythm: dark hero with floating accent strokes → quiet role/purpose/audience trio →
 * values strip → dark capabilities break with numbered grid → editorial story → dark CTA
 *
 * Mirrors the products list page aesthetic: uppercase tracking-widest labels,
 * accent-bar markers, alternating light/dark sections, dot-texture dark panels.
 */
export const ProductDetailTemplate = ({
  product,
}: ProductDetailProps): JSX.Element => {
  const { frontmatter, body, labels } = product;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    {
      label: product.listLabel ?? "Products",
      href: product.listUrl ?? "/products",
    },
    { label: frontmatter.name },
  ];

  return (
    <>
      <Head title={frontmatter.name} description={body.tagline} />

      {/* Hero — compact dark panel with accent stroke detail */}
      <header className="relative w-full bg-brand-dark overflow-hidden">
        <style>{`
          @keyframes detail-drift {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          .detail-wave { animation: detail-drift 28s linear infinite; }
          @media (prefers-reduced-motion: reduce) {
            .detail-wave { animation: none; }
          }
        `}</style>

        {/* Accent stroke lines — layered, drifting */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <svg
            preserveAspectRatio="none"
            width="200%"
            height="100%"
            viewBox="0 0 1600 400"
            className="block absolute inset-0 detail-wave"
          >
            <path
              d="M0,200 C67,140 133,140 200,200 C267,260 333,260 400,200 C467,140 533,140 600,200 C667,260 733,260 800,200 C867,140 933,140 1000,200 C1067,260 1133,260 1200,200 C1267,140 1333,140 1400,200 C1467,260 1533,260 1600,200"
              className="stroke-accent"
              strokeWidth="2"
              strokeMiterlimit="10"
              fill="none"
              opacity="0.15"
            />
            <path
              d="M0,230 C67,170 133,170 200,230 C267,290 333,290 400,230 C467,170 533,170 600,230 C667,290 733,290 800,230 C867,170 933,170 1000,230 C1067,290 1133,290 1200,230 C1267,170 1333,170 1400,230 C1467,290 1533,290 1600,230"
              className="stroke-accent"
              strokeWidth="1.5"
              strokeMiterlimit="10"
              fill="none"
              opacity="0.06"
            />
          </svg>
        </div>

        {/* Dot texture */}
        <div className="absolute inset-0 cta-bg-pattern pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto w-full px-6 md:px-12 pt-12 md:pt-20 pb-16 md:pb-24">
          <div className="mb-8">
            <Breadcrumb items={breadcrumbItems} />
          </div>

          <div className="mb-6">
            <StatusBadge status={frontmatter.status} />
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-[7rem] font-bold text-white tracking-tighter leading-[0.95] mb-6 md:mb-8">
            {frontmatter.name}
          </h1>

          <div className="w-20 h-1.5 bg-accent mb-6 md:mb-8" />

          <p className="text-lg md:text-xl text-white/70 leading-relaxed max-w-xl">
            {body.tagline}
          </p>
        </div>
      </header>

      {/* Role / Purpose / Audience — quiet trio with dividers */}
      <section className="bg-theme-subtle py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-0">
            {/* Role */}
            <div className="md:pr-12">
              <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-4">
                {labels["role"]}
              </h2>
              <p className="text-xl md:text-2xl leading-relaxed text-heading font-light">
                {body.role}
              </p>
            </div>

            {/* Purpose */}
            <div className="md:border-l md:border-theme md:px-12">
              <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-4">
                {labels["purpose"]}
              </h2>
              <p className="text-xl md:text-2xl leading-relaxed text-heading font-light">
                {body.purpose}
              </p>
            </div>

            {/* Audience */}
            <div className="md:border-l md:border-theme md:pl-12">
              <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-4">
                {labels["audience"]}
              </h2>
              <p className="text-xl md:text-2xl leading-relaxed text-heading font-light">
                {body.audience}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values — horizontal strip with accent tags */}
      <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-20">
        <section>
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
            <h2 className="text-sm tracking-widest uppercase text-theme-muted whitespace-nowrap">
              {labels["values"]}
            </h2>
            <TagsList tags={body.values} variant="accent" size="md" />
          </div>
        </section>
      </div>

      {/* Capabilities — dark panel with numbered grid */}
      <section className="cta-bg-pattern bg-brand py-20 md:py-32 px-6 md:px-12">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-sm tracking-widest uppercase text-white/50 mb-16">
            {labels["features"]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            {body.features.map((feature, i) => (
              <div key={feature.title}>
                <div className="flex items-start gap-6">
                  <span className="text-5xl md:text-6xl font-black text-white/10 leading-none shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="pt-2">
                    <div className="w-8 h-1 bg-accent mb-4" />
                    <h3 className="text-xl font-bold text-white mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-white/70 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story — editorial prose, generous whitespace */}
      <section className="py-20 md:py-32 px-6 md:px-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            {labels["story"]}
          </h2>
          <div className="space-y-6">
            {body.story.split("\n\n").map((paragraph, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-2xl md:text-3xl leading-relaxed text-heading font-light"
                    : "text-lg leading-relaxed text-theme-muted"
                }
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — deep blue, product-specific call to action */}
      {/* Extra bottom padding + negative margin so the layout's WavyDivider overlaps the blue */}
      <section className="cta-bg-pattern bg-brand-dark pt-24 md:pt-32 pb-40 md:pb-48 -mb-[60px] px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm tracking-widest uppercase text-white/60 mb-4">
            {frontmatter.name}
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-white max-w-2xl mb-10">
            Interested in {frontmatter.name}?
          </h2>
          <LinkButton
            href={product.listUrl ?? "/products"}
            variant="outline-light"
            size="lg"
          >
            View all products
          </LinkButton>
        </div>
      </section>
    </>
  );
};
