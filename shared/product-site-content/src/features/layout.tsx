import type { JSX } from "preact";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { FeaturesSection } from "./schema";
import * as LucideIcons from "lucide-preact";
import type { LucideIcon } from "lucide-preact";

const getIcon = (iconName: string): LucideIcon => {
  // Get the icon component from Lucide, fallback to HelpCircle if not found
  const IconComponent =
    (LucideIcons as unknown as Record<string, LucideIcon>)[iconName] ??
    LucideIcons.HelpCircle;
  return IconComponent;
};

export const FeaturesLayout = ({
  headline,
  description,
  features,
}: FeaturesSection): JSX.Element => {
  return (
    <section className="py-16 md:py-24 bg-theme-subtle">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-theme mb-4">
            {headline}
          </h2>
          <p className="text-xl text-theme-muted max-w-3xl mx-auto">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const IconComponent = getIcon(feature.icon);
            return (
              <div
                key={index}
                className="bg-theme rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-brand mb-4">
                  <IconComponent size={48} />
                </div>
                <h3 className="text-xl font-semibold text-theme mb-2">
                  {feature.title}
                </h3>
                <p className="text-theme-muted">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
