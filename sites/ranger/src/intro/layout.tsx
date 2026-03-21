import type { JSX } from "preact";
import type { IntroContent } from "./schema";

export const IntroLayout = ({
  tagline,
  description,
}: IntroContent): JSX.Element => {
  return (
    <section className="intro-section relative overflow-hidden flex items-center flex-grow">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/20 via-transparent to-accent/20 animate-pulse"></div>
        <div
          className="absolute inset-0 bg-gradient-to-tr from-accent/10 via-transparent to-brand/10 animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand/30 rounded-full filter blur-3xl animate-blob"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/30 rounded-full filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -top-48 -left-48 w-96 h-96 bg-gradient-to-br from-brand/40 to-accent/40 rounded-full filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <div className="container mx-auto px-4 max-w-7xl py-12 relative">
        {/* Main intro - centered and prominent */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-heading">
            {tagline}
          </h1>
          <p className="text-xl md:text-2xl text-theme leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
};
