import type { FeaturesSection } from "./schema";

export const FeaturesLayout = ({
  headline,
  description,
  features,
}: FeaturesSection) => {
  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-text-dark mb-4">
            {headline}
          </h2>
          <p className="text-xl text-text-gray max-w-3xl mx-auto">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-text-dark mb-2">
                {feature.title}
              </h3>
              <p className="text-text-gray">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
