import type { JSX } from "preact";
import * as Icons from "lucide-preact";
import type { IntroContent } from "./schema";

export const IntroLayout = ({
  tagline,
  description,
  features,
}: IntroContent): JSX.Element => {
  return (
    <section className="intro-section relative overflow-hidden">
      {/* Background gradient for visual interest */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-accent/5"></div>

      <div className="container mx-auto px-4 max-w-7xl py-24 md:py-32 relative">
        {/* Main intro - larger and more prominent */}
        <div className="text-center mb-20 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-theme">
            {tagline}
          </h1>
          <p className="text-xl md:text-2xl text-theme-muted leading-relaxed">
            {description}
          </p>
        </div>

        {/* Features grid - cleaner and more balanced */}
        {features && features.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {features.map((feature, index) => {
              // Get the icon component dynamically
              const iconName = feature.icon as keyof typeof Icons;
              // Type assertion needed due to Lucide's complex type exports
              const IconComponent = (Icons[iconName] ?? Icons.Box) as typeof Icons.Box;

              return (
                <div key={index} className="group">
                  <div className="h-full p-8 rounded-xl bg-theme-subtle/20 border border-theme-border/30 hover:border-brand/30 hover:bg-theme-subtle/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                    {/* Simplified icon */}
                    <div className="flex items-center justify-center w-16 h-16 mb-6 rounded-xl bg-brand/10 text-brand group-hover:bg-brand/15 transition-colors">
                      <IconComponent
                        size={28}
                        className="stroke-current fill-none"
                        strokeWidth={1.5}
                      />
                    </div>

                    {/* Text content */}
                    <h3 className="text-lg font-semibold mb-2 text-theme">
                      {feature.title}
                    </h3>
                    <p className="text-theme-muted text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
