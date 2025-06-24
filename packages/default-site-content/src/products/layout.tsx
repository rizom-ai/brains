import type { ProductsSection } from "./schema";

export const ProductsLayout = ({
  headline,
  description,
  products,
}: ProductsSection) => {
  const statusColors = {
    live: "bg-green-100 text-green-800",
    beta: "bg-blue-100 text-blue-800",
    alpha: "bg-yellow-100 text-yellow-800",
    concept: "bg-gray-100 text-gray-800",
  };

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-text-dark mb-4">
            {headline}
          </h2>
          <p className="text-xl text-text-gray max-w-3xl mx-auto">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-gray-50 rounded-2xl p-8 hover:bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-primary-purple-light"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="text-4xl">{product.icon}</div>
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${statusColors[product.status]}`}
                >
                  {product.status}
                </span>
              </div>

              <h3 className="text-2xl font-bold text-text-dark mb-2">
                {product.name}
              </h3>
              <p className="text-sm font-semibold text-primary-purple mb-4">
                {product.tagline}
              </p>
              <p className="text-text-gray leading-relaxed mb-6">
                {product.description}
              </p>

              {product.link && (
                <a
                  href={product.link}
                  className="inline-flex items-center text-primary-purple font-semibold hover:text-primary-purple-dark transition-colors"
                >
                  Learn more
                  <svg
                    className="ml-1 w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    ></path>
                  </svg>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
