import type { LandingHeroData } from "./schema";

export const HeroLayout = ({
  headline,
  subheadline,
  ctaText,
  ctaLink,
}: LandingHeroData): JSX.Element => {
  return (
    <section className="hero-section py-20 md:py-32 text-center relative overflow-hidden bg-gradient-to-br from-brand-light to-theme">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, rgba(139, 92, 246, 0.3) 1px, transparent 0)",
            backgroundSize: "50px 50px",
          }}
        ></div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl relative z-10">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-theme">
          {headline}
        </h1>
        <p className="text-xl md:text-2xl text-theme-muted mb-8 max-w-3xl mx-auto">
          {subheadline}
        </p>
        {ctaText && ctaLink && (
          <a
            href={ctaLink}
            className="inline-block bg-brand hover:bg-brand-dark text-theme-inverse font-semibold py-4 px-8 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
          >
            {ctaText}
          </a>
        )}
      </div>
    </section>
  );
};
