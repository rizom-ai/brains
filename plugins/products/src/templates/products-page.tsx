import type { JSX } from "preact";
import type { OverviewWithData } from "../schemas/overview";
import type { EnrichedProduct } from "../schemas/product";
import { markdownToHtml } from "@brains/utils";
import {
  Head,
  LinkButton,
  StatusBadge,
  ProseContent,
  Card,
  TagsList,
} from "@brains/ui-library";

export interface ProductsPageProps {
  overview: OverviewWithData;
  products: EnrichedProduct[];
}

/**
 * Products page template — editorial showcase of brain models
 */
export const ProductsPageTemplate = ({
  overview,
  products,
}: ProductsPageProps): JSX.Element => {
  const { frontmatter, body } = overview;

  return (
    <>
      <Head title={frontmatter.headline} description={frontmatter.tagline} />

      {/* Hero — tall, bottom-aligned, matching homepage pattern */}
      <header className="hero-bg-pattern relative w-full min-h-[70vh] flex items-end px-6 md:px-12 bg-theme overflow-hidden">
        <div className="relative z-10 max-w-4xl mx-auto w-full pb-16 md:pb-24">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-heading tracking-tight leading-[1.08]">
            {frontmatter.headline}
          </h1>
          <div className="w-12 border-t border-theme mt-8 mb-6 md:mt-10 md:mb-8" />
          <p className="text-lg md:text-xl text-theme-muted leading-relaxed max-w-xl md:max-w-lg">
            {frontmatter.tagline}
          </p>
        </div>
      </header>

      {/* Main Content — shared container */}
      <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-24">
        {/* Vision — impactful statement */}
        <section className="mb-20 md:mb-32">
          <div className="border-t border-theme pt-8">
            <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-8">
              Vision
            </h2>
            <p className="text-2xl md:text-3xl leading-relaxed text-theme font-light max-w-3xl">
              {body.vision}
            </p>
          </div>
        </section>

        {/* Pillars — numbered with strong vertical rhythm */}
        <section className="mb-20 md:mb-32">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            Core Principles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            {body.pillars.map((pillar, i) => (
              <div key={pillar.title}>
                <span className="text-6xl font-bold text-brand/30 leading-none block mb-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-semibold text-heading mb-3">
                  {pillar.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Brain Models — magazine-style feature spreads */}
        {products.length > 0 && (
          <section className="mb-20 md:mb-32">
            <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-16">
              Brain Models
            </h2>
            <div className="space-y-24">
              {products.map((product, i) => (
                <div key={product.id}>
                  {i > 0 && <div className="border-t border-theme mb-24" />}
                  <ProductFeature product={product} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Benefits — accent border grid */}
        <section className="mb-20 md:mb-32">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-12">
            Why Brains
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {body.benefits.map((benefit) => (
              <div key={benefit.title} className="border-l-2 border-brand pl-6">
                <h3 className="text-lg font-semibold text-heading mb-2">
                  {benefit.title}
                </h3>
                <p className="text-theme-muted leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Technologies — minimal strip */}
        <section className="mb-20 md:mb-32">
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
            <h2 className="text-sm tracking-widest uppercase text-theme-muted whitespace-nowrap">
              Built With
            </h2>
            <TagsList tags={body.technologies} variant="accent" size="md" />
          </div>
        </section>
      </div>

      {/* CTA — brand-colored with dot pattern */}
      <section className="cta-bg-pattern bg-brand py-24 md:py-32 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm tracking-widest uppercase text-white/60 mb-4">
            Ready to Build
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-white max-w-2xl mb-10">
            {body.cta.text}
          </h2>
          <LinkButton href={body.cta.link} variant="outline-light" size="lg">
            {body.cta.text}
          </LinkButton>
        </div>
      </section>
    </>
  );
};

/**
 * Product feature spread — magazine-style layout for a single brain model
 */
function ProductFeature({
  product,
}: {
  product: EnrichedProduct;
}): JSX.Element {
  const { frontmatter, body } = product;
  const htmlContent = body.story.trim() ? markdownToHtml(body.story) : null;

  return (
    <article>
      {/* Product header — name, badge, tagline */}
      <div className="mb-10">
        <div className="flex items-baseline gap-4 mb-3">
          <h3 className="text-4xl md:text-5xl font-bold text-heading leading-none">
            {frontmatter.name}
          </h3>
          <StatusBadge status={frontmatter.status} />
        </div>
        <p className="text-xl text-theme-muted">{body.tagline}</p>
      </div>

      {/* Two-column: metadata + features */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
        {/* Left column — role, purpose, audience, values */}
        <div className="md:col-span-2 space-y-8">
          <div>
            <h4 className="text-sm tracking-widest uppercase text-theme-muted mb-2">
              Role
            </h4>
            <p className="text-theme leading-relaxed">{body.role}</p>
          </div>
          <div>
            <h4 className="text-sm tracking-widest uppercase text-theme-muted mb-2">
              Purpose
            </h4>
            <p className="text-theme leading-relaxed">{body.purpose}</p>
          </div>
          <div>
            <h4 className="text-sm tracking-widest uppercase text-theme-muted mb-2">
              Audience
            </h4>
            <p className="text-theme leading-relaxed">{body.audience}</p>
          </div>
          <div>
            <h4 className="text-sm tracking-widest uppercase text-theme-muted mb-2">
              Values
            </h4>
            <TagsList tags={body.values} variant="muted" size="sm" />
          </div>
        </div>

        {/* Right column — feature cards */}
        <div className="md:col-span-3">
          <h4 className="text-sm tracking-widest uppercase text-theme-muted mb-4">
            Capabilities
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {body.features.map((feature) => (
              <Card key={feature.title} variant="compact">
                <h5 className="font-semibold text-heading mb-1.5">
                  {feature.title}
                </h5>
                <p className="text-sm text-theme-muted leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Story */}
      {htmlContent && (
        <div className="mt-12 max-w-3xl">
          <ProseContent html={htmlContent} />
        </div>
      )}
    </article>
  );
}
