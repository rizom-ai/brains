import type { LandingHeroData } from "./schema";

export const HeroLayout = ({
  headline,
  subheadline,
  ctaText,
  ctaLink,
}: LandingHeroData) => {
  return (
    <section className="hero-section py-20 md:py-32 text-center relative overflow-hidden">
      <div className="container mx-auto px-4 max-w-5xl relative z-10">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-text-dark">
          {headline}
        </h1>
        <p className="text-xl md:text-2xl text-text-gray mb-8 max-w-3xl mx-auto">
          {subheadline}
        </p>
        {ctaText && ctaLink && (
          <a
            href={ctaLink}
            className="inline-block bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200"
          >
            {ctaText}
          </a>
        )}
      </div>
    </section>
  );
};
