import type { ProductsSection } from "./schema";
import * as LucideIcons from "lucide-preact";
import type { LucideIcon } from "lucide-preact";

const getIcon = (iconName: string): LucideIcon => {
  // Get the icon component from Lucide, fallback to HelpCircle if not found
  const IconComponent =
    (LucideIcons as unknown as Record<string, LucideIcon>)[iconName] ??
    LucideIcons.HelpCircle;
  return IconComponent;
};

export const ProductsLayout = ({
  headline,
  description,
  products,
}: ProductsSection): JSX.Element => {
  const statusColors = {
    live: "bg-green-100 text-green-800",
    beta: "bg-blue-100 text-blue-800",
    alpha: "bg-yellow-100 text-yellow-800",
    concept: "bg-gray-100 text-gray-800",
  };

  return (
    <section className="py-16 md:py-24 bg-theme">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-theme mb-4">
            {headline}
          </h2>
          <p className="text-xl text-theme-muted max-w-3xl mx-auto">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {products.map((product) => {
            const IconComponent = getIcon(product.icon);
            return (
              <div
                key={product.id}
                className="bg-theme-subtle rounded-2xl p-8 hover:bg-theme hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-brand-light"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="text-brand">
                    <IconComponent size={48} />
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${statusColors[product.status]}`}
                  >
                    {product.status}
                  </span>
                </div>

                <h3 className="text-2xl font-bold text-theme mb-2">
                  {product.name}
                </h3>
                <p className="text-sm font-semibold text-brand mb-4">
                  {product.tagline}
                </p>
                <p className="text-theme-muted leading-relaxed mb-6">
                  {product.description}
                </p>

                {product.link && (
                  <a
                    href={product.link}
                    className="inline-flex items-center text-brand font-semibold hover:text-brand transition-colors"
                  >
                    Learn more
                    <LucideIcons.ChevronRight className="ml-1 w-4 h-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
